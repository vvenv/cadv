#!/usr/bin/env python3
"""
Assemble release files from images that mcconfig already built
(release, esp32/esp32s3_cdc). Used by .github/workflows/release.yml and
by hand after `./do.sh sd fw` / `./do.sh burner`:

    source "$IDF_PATH/export.sh"     # for esptool
    python3 scripts/make_site.py --version 1.0.0

Writes to dist/site/ (or --out):
    index.html, help.html   web flasher pages (web/* with placeholders filled in)
    app/<id>.html           one page per program, from fw/<id>/README.md (web/_app.html)
    fw/<id>.bin             merged image: bootloader, partition table, otadata, app; flash at 0x0
    fw/<id>.json            ESP Web Tools manifest for it
    cadv-sd-<version>.zip   what goes on the card: cadv/<id>.bin/.txt/.icon, word banks
Firmware with no build output is skipped with a warning.

--prebuilt DIR skips compiling: it takes the merged <id>.bin images and the
cadv-sd-*.zip from DIR (a downloaded GitHub release) and only rebuilds the
pages. .github/workflows/site.yml uses this when only the web pages changed.
"""

import argparse
import html
import json
import os
import shutil
import subprocess
import sys
import zipfile

import webmd
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ("esp32", "esp32s3_cdc", "release")
BASE_ID = "base"  # launcher; flashed to the chip, never copied onto the card


def label(fw: Path) -> str:
	try:
		return (fw / "label").read_text(encoding="utf-8").splitlines()[0].strip() or fw.name
	except (OSError, IndexError):
		return fw.name


def main():
	ap = argparse.ArgumentParser(description="Assemble the web flasher site and SD bundle")
	ap.add_argument("--version", required=True)
	ap.add_argument("--out", default=str(ROOT / "dist/site"))
	ap.add_argument("--moddable", default=os.environ.get("MODDABLE", str(ROOT / "third_party/moddable")))
	ap.add_argument("--prebuilt", help="reuse release images from this directory instead of the build tree")
	args = ap.parse_args()

	moddable = Path(args.moddable)
	out = Path(args.out)
	if out.exists():
		shutil.rmtree(out)
	(out / "fw").mkdir(parents=True)
	card = out / "sd" / "cadv"
	card.mkdir(parents=True)

	apps = []
	for fw in sorted(p for p in (ROOT / "fw").iterdir() if (p / "manifest.json").is_file()):
		fid = fw.name
		merged = out / "fw" / f"{fid}.bin"
		if args.prebuilt:
			src = Path(args.prebuilt) / f"{fid}.bin"
			if not src.is_file():
				print(f"warning: {fid} is not in the release, skipped", file=sys.stderr)
				continue
			shutil.copyfile(src, merged)
		else:
			build = moddable / "build/tmp" / TARGET[0] / TARGET[1] / TARGET[2] / fid / "xsProj-esp32s3/build"
			image = moddable / "build/bin" / TARGET[0] / TARGET[1] / TARGET[2] / fid / "xs_esp32.bin"
			if not (build / "flash_args").is_file() or not image.is_file():
				print(f"warning: {fid} has no release build, skipped", file=sys.stderr)
				continue
			if "--flash-size 8MB" not in (build / "flash_args").read_text():
				sys.exit(f"{fid} was built for the old 4MB table; rebuild it")
			subprocess.run(
				[sys.executable, "-m", "esptool", "--chip", "esp32s3", "merge-bin", "-o", str(merged), "@flash_args"],
				cwd=build, check=True, stdout=subprocess.DEVNULL,
			)
		name = label(fw)
		(out / "fw" / f"{fid}.json").write_text(json.dumps({
			"name": f"CADV {name}",
			"version": args.version,
			"new_install_prompt_erase": True,
			"builds": [{"chipFamily": "ESP32-S3", "parts": [{"path": f"{fid}.bin", "offset": 0}]}],
		}, ensure_ascii=False, indent="\t") + "\n", encoding="utf-8")
		readme = fw / "README.md"
		summary, body = webmd.render(readme.read_text(encoding="utf-8"), f"fw/{fid}/") if readme.is_file() else ("", "")
		apps.append({"id": fid, "label": name, "size": merged.stat().st_size, "summary": summary, "body": body})

		if fid == BASE_ID or args.prebuilt:
			continue  # the base stays in flash, never on the card; a prebuilt bundle is reused
		shutil.copyfile(image, card / f"{fid}.bin")
		(card / f"{fid}.txt").write_text(name + "\n", encoding="utf-8")
		if (fw / "icon").is_file():
			shutil.copyfile(fw / "icon", card / f"{fid}.icon")
		if fid == "words":
			for pack in sorted(fw.glob("*.bin")):
				if pack.name != "wordbank.bin":  # that one is built into the image
					(card / "words").mkdir(exist_ok=True)
					shutil.copyfile(pack, card / "words" / pack.name)
		if fid == "dict" and (fw / "lex.bin").is_file():
			(card / "dict").mkdir(exist_ok=True)
			shutil.copyfile(fw / "lex.bin", card / "dict" / "lex.bin")

	if not any(a["id"] == BASE_ID for a in apps):
		sys.exit("the base (fw/base) was not built")

	bundle = out / f"cadv-sd-{args.version}.zip"
	if args.prebuilt:
		zips = sorted(Path(args.prebuilt).glob("cadv-sd-*.zip"))
		if len(zips) != 1:
			sys.exit(f"expected one cadv-sd-*.zip in {args.prebuilt}, found {len(zips)}")
		bundle = out / zips[0].name
		shutil.copyfile(zips[0], bundle)
	else:
		with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as z:
			for path in sorted((out / "sd").rglob("*")):
				if path.is_file():
					z.write(path, path.relative_to(out / "sd"))
	shutil.rmtree(out / "sd")

	def row(app):
		mb = f"{app['size'] / 1048576:.1f} MB"
		e = html.escape
		return (
			f'\t\t<li><a class="name" href="app/{e(app["id"])}.html">{e(app["label"])}</a>'
			f'<span class="sub" title="{e(app["summary"])}">{e(app["summary"])}</span>'
			f'<esp-web-install-button manifest="fw/{e(app["id"])}.json" title="{e(app["id"])} · {mb}">'
			f'<button slot="activate">烧录</button></esp-web-install-button></li>'
		)

	def fill(page: str, extra: dict[str, str]) -> str:
		for k, v in {"VERSION": html.escape(args.version), "SD_ZIP": bundle.name, **extra}.items():
			page = page.replace("{{" + k + "}}", v)
		return page

	others = "\n".join(row(a) for a in apps if a["id"] != BASE_ID)
	# Every file in web/ is published; *.html get the placeholders filled in.
	# Files starting with _ are templates, not pages.
	for src in sorted((ROOT / "web").iterdir()):
		if not src.is_file() or src.name.startswith("_"):
			continue
		if src.suffix != ".html":
			shutil.copyfile(src, out / src.name)
			continue
		(out / src.name).write_text(fill(src.read_text(encoding="utf-8"), {"APPS": others}), encoding="utf-8")

	tmpl = (ROOT / "web/_app.html").read_text(encoding="utf-8")
	(out / "app").mkdir()
	for a in apps:
		base = a["id"] == BASE_ID
		page = fill(tmpl, {
			"ID": html.escape(a["id"]),
			"LABEL": html.escape(a["label"]),
			"SUMMARY": html.escape(a["summary"]),
			"FLASH": "烧录" if base else "单独烧录",
			"TIP": "电源关 → 按住 G0 → 插 USB → 松开，再点烧录。&#10;烧完按 RESET。" if base
			else "想和别的程序一起用：烧基座，再把首页的「SD 卡程序包」放到 microSD。&#10;单独烧录会盖掉芯片里的基座。",
			"BODY": a["body"],
		})
		(out / "app" / f"{a['id']}.html").write_text(page, encoding="utf-8")
	print(f"{out}: {len(apps)} images, {bundle.name}")


if __name__ == "__main__":
	main()

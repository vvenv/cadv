#!/usr/bin/env python3
"""
Assemble release files from images that mcconfig already built
(release, esp32/esp32s3_cdc). Used by .github/workflows/release.yml and
by hand after `./do.sh sd fw` / `./do.sh burner`:

    source "$IDF_PATH/export.sh"     # for esptool
    python3 scripts/make_site.py --version 1.0.0

Writes to dist/site/ (or --out):
    index.html, help.html   web flasher pages (web/* with placeholders filled in)
    fw/<id>.bin             merged image: bootloader, partition table, otadata, app; flash at 0x0
    fw/<id>.json            ESP Web Tools manifest for it
    cadv-sd-<version>.zip   what goes on the card: cadv/<id>.bin/.txt/.icon, word banks
Firmware with no build output is skipped with a warning.
"""

import argparse
import html
import json
import os
import shutil
import subprocess
import sys
import zipfile
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
		build = moddable / "build/tmp" / TARGET[0] / TARGET[1] / TARGET[2] / fid / "xsProj-esp32s3/build"
		image = moddable / "build/bin" / TARGET[0] / TARGET[1] / TARGET[2] / fid / "xs_esp32.bin"
		if not (build / "flash_args").is_file() or not image.is_file():
			print(f"warning: {fid} has no release build, skipped", file=sys.stderr)
			continue
		if "--flash-size 8MB" not in (build / "flash_args").read_text():
			sys.exit(f"{fid} was built for the old 4MB table; rebuild it")
		merged = out / "fw" / f"{fid}.bin"
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
		apps.append({"id": fid, "label": name, "size": merged.stat().st_size})

		if fid == BASE_ID:
			continue  # the base stays in flash, never on the card
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
	with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as z:
		for path in sorted((out / "sd").rglob("*")):
			if path.is_file():
				z.write(path, path.relative_to(out / "sd"))
	shutil.rmtree(out / "sd")

	def row(app):
		mb = f"{app['size'] / 1048576:.1f} MB"
		return (
			f'\t\t<li title="{html.escape(app["id"])} · {mb}"><span class="name">{html.escape(app["label"])}</span>'
			f'<esp-web-install-button manifest="fw/{app["id"]}.json">'
			f'<button slot="activate">烧录</button></esp-web-install-button></li>'
		)

	others = "\n".join(row(a) for a in apps if a["id"] != BASE_ID)
	# Every file in web/ is published; *.html get the placeholders filled in.
	for src in sorted((ROOT / "web").iterdir()):
		if not src.is_file():
			continue
		if src.suffix != ".html":
			shutil.copyfile(src, out / src.name)
			continue
		page = src.read_text(encoding="utf-8")
		page = page.replace("{{VERSION}}", html.escape(args.version))
		page = page.replace("{{SD_ZIP}}", bundle.name)
		page = page.replace("{{APPS}}", others)
		(out / src.name).write_text(page, encoding="utf-8")
	print(f"{out}: {len(apps)} images, {bundle.name}")


if __name__ == "__main__":
	main()

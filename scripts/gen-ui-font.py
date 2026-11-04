#!/usr/bin/env python3
"""Generate app/fonts/UI-Regular-N BMFont from Source Han Sans SC.

Usage:
  python3 scripts/gen-ui-font.py            # 20px Medium
  python3 scripts/gen-ui-font.py --size 20 --weight Medium
"""
from __future__ import annotations

import argparse
import re
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "app" / "fonts"
DEFAULT_FONT = Path.home() / "Library/Fonts/SourceHanSans-VF.otf.ttc"
SC_INDEX = 2  # Source Han Sans SC VF
FAMILY = "UI"

WEIGHT_NAME_TO_WGHT = {
	"ExtraLight": 200,
	"Light": 300,
	"Normal": 350,
	"Regular": 400,
	"Medium": 500,
	"Bold": 700,
	"Heavy": 900,
}


def collect_chars() -> str:
	files = [
		ROOT / "app" / "main.ts",
		ROOT / "app" / "weather.ts",
		ROOT / "app" / "settings.ts",
		ROOT / "app" / "netboot.ts",
		ROOT / "app" / "keyboard_stub.ts",
		ROOT / "app" / "sound_stub.ts",
	]
	text = "\n".join(p.read_text(encoding="utf-8") for p in files if p.exists())
	chars = {chr(c) for c in range(0x20, 0x7F)}  # full basic ASCII
	for m in re.finditer(r"const (WEEKDAYS|GAN|ZHI|LM|LD1|LD2)\s*=\s*(\[[^\]]*\])", text):
		import ast

		for s in ast.literal_eval(m.group(2)):
			chars.update(s)
	for chunk in re.findall(r"`[^`]*`|\"[^\"\\]*(?:\\.[^\"\\]*)*\"|'[^'\\]*(?:\\.[^'\\]*)*'", text):
		chars.update(ch for ch in chunk if ord(ch) >= 32)
	chars.update("年月日周闰初十廿卅冬腊设闹钟等待对时℃")
	return "".join(sorted(chars, key=ord))


def block(btype: int, data: bytes) -> bytes:
	return struct.pack("<BI", btype, len(data)) + data


def generate(font_path: Path, size: int, weight: str, mono: bool) -> None:
	if not font_path.exists():
		sys.exit(f"font not found: {font_path}")
	font = ImageFont.truetype(str(font_path), size, index=SC_INDEX)
	try:
		font.set_variation_by_name(weight)
	except Exception:
		font.set_variation_by_axes([WEIGHT_NAME_TO_WGHT.get(weight, 500)])

	ascent, descent = font.getmetrics()
	line_height = ascent + descent + 2
	base = ascent
	pad = 1
	chars = collect_chars()
	threshold = 96

	glyphs: list[tuple] = []
	for ch in chars:
		bbox = font.getbbox(ch, anchor="ls")
		if not bbox:
			continue
		x0, y0, x1, y1 = bbox
		gw = max(1, x1 - x0)
		gh = max(1, y1 - y0)
		img = Image.new("L", (gw, gh), 0)
		ImageDraw.Draw(img).text((-x0, -y0), ch, font=font, fill=255, anchor="ls")
		if mono:
			img = img.point(lambda p: 255 if p >= threshold else 0)
		glyphs.append(
			(
				ord(ch),
				gw,
				gh,
				int(round(x0)),
				int(round(base + y0)),
				int(round(font.getlength(ch))),
				img,
			)
		)

	atlas_w = 256
	x = pad
	y = pad
	row_h = 0
	placed: list[tuple] = []
	for cp, gw, gh, xoff, yoff, xadv, img in glyphs:
		if x + gw + pad > atlas_w:
			x = pad
			y += row_h + pad
			row_h = 0
		placed.append((cp, x, y, gw, gh, xoff, yoff, xadv, img))
		x += gw + pad
		row_h = max(row_h, gh)
	atlas_h = (y + row_h + pad + 3) & ~3

	atlas = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
	for cp, ax, ay, gw, gh, xoff, yoff, xadv, img in placed:
		rgba = Image.new("RGBA", img.size, (0, 0, 0, 0))
		rgba.putalpha(img)
		atlas.paste(rgba, (ax, ay), rgba)

	out_stem = f"{FAMILY}-Regular-{size}"
	info = struct.pack("<hBBHBBBBBBBB", -size, 0, 0, 100, 1, 0, 0, 0, 0, 1, 1, 0) + FAMILY.encode() + b"\x00"
	common = struct.pack("<HHHHBBBBBB", line_height, base, atlas_w, atlas_h, 1, 0, 0, 0, 0, 0)
	pages = (out_stem + ".png").encode() + b"\x00"
	char_blob = b"".join(
		struct.pack("<IHHHHhhhBB", cp, ax, ay, gw, gh, xoff, yoff, xadv, 0, 15)
		for cp, ax, ay, gw, gh, xoff, yoff, xadv, _ in placed
	)
	raw = b"BMF\x03" + block(1, info) + block(2, common) + block(3, pages) + block(4, char_blob)

	for old in OUT_DIR.glob(f"{FAMILY}-Regular-*.*"):
		old.unlink()
	OUT_DIR.mkdir(parents=True, exist_ok=True)
	(OUT_DIR / f"{out_stem}.fnt").write_bytes(raw)
	atlas.save(OUT_DIR / f"{out_stem}.png")
	print(f"wrote {out_stem} glyphs={len(placed)} lineH={line_height} base={base} atlas={atlas.size} weight={weight}")


def main() -> None:
	ap = argparse.ArgumentParser(description=__doc__)
	ap.add_argument("--font", type=Path, default=DEFAULT_FONT)
	ap.add_argument("--size", type=int, default=20)
	ap.add_argument("--weight", default="Medium", choices=list(WEIGHT_NAME_TO_WGHT))
	ap.add_argument("--mono", action="store_true", help="threshold to 1-bit glyphs")
	args = ap.parse_args()
	generate(args.font, args.size, args.weight, args.mono)


if __name__ == "__main__":
	main()

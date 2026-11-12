#!/usr/bin/env python3
"""
Upload a release image to M5Burner (burner.m5stack.com, API v1).

    ./do.sh burner words                       # makes dist/burner/words-<ver>.bin
    python3 scripts/burner_publish.py words --version 1.0.0            # dry run
    python3 scripts/burner_publish.py words --version 1.0.0 --yes      # upload

Listings live in scripts/burner.json, keyed by firmware id (fw/<id>).
With "firmwareId" set, the listing's name, categories and devices are read
back from M5Burner and a new version is added, the same way M5Launcher's CI
does it. With "firmwareId" null, the first upload creates the listing from
the config and the markdown "description" file; put the id it prints back
into burner.json. fw/<id>/cover.png (./do.sh shot <id>) goes up as the cover.

A PUBLIC upload goes into M5Burner's review queue; there is no separate
publish step. Credentials come from $M5BURNER_USER / $M5BURNER_PWD.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

API = "https://burner.m5stack.com/api/v1"
ROOT = Path(__file__).resolve().parent.parent


def call(method, path, token=None, body=None, files=None):
	headers = {"Accept": "application/json", "User-Agent": "cadv-publish"}
	if token:
		headers["Authorization"] = token
	data = None
	if files is not None:
		boundary = uuid.uuid4().hex
		parts = []
		for name, value in (body or {}).items():
			parts.append(
				f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
			)
		for name, (filename, payload) in files.items():
			parts.append(
				(
					f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
					f"Content-Type: {'image/png' if filename.endswith('.png') else 'application/octet-stream'}\r\n\r\n"
				).encode()
				+ payload
				+ b"\r\n"
			)
		parts.append(f"--{boundary}--\r\n".encode())
		data = b"".join(parts)
		headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
	elif body is not None:
		data = json.dumps(body).encode()
		headers["Content-Type"] = "application/json"
	req = urllib.request.Request(API + path, data=data, method=method, headers=headers)
	try:
		with urllib.request.urlopen(req, timeout=300) as res:
			status, text = res.status, res.read().decode("utf-8", "replace")
	except urllib.error.HTTPError as e:
		status, text = e.code, e.read().decode("utf-8", "replace")
	try:
		reply = json.loads(text)
	except ValueError:
		reply = None
	if status not in (200, 201) or not reply or reply.get("code") not in (200, 201):
		raise SystemExit(f"{method} {path}: HTTP {status} {text[:500]}")
	return reply.get("data")


def login():
	user, password = os.environ.get("M5BURNER_USER"), os.environ.get("M5BURNER_PWD")
	if not user or not password:
		raise SystemExit("set M5BURNER_USER and M5BURNER_PWD")
	data = call(
		"POST",
		"/auth/login",
		body={"email": user, "password": password, "rememberMe": False, "deviceName": "cadv publish"},
	) or {}
	if not data.get("accessToken"):
		raise SystemExit("login returned no token")
	return f"{data.get('tokenType', 'Bearer')} {data['accessToken']}"


def markdown(text):
	return json.dumps({"format": "markdown", "content": text}, ensure_ascii=False)


def main():
	if hasattr(sys.stdout, "reconfigure"):
		sys.stdout.reconfigure(errors="replace")  # replies carry Chinese status text
	ap = argparse.ArgumentParser(description="Upload a cadv image to M5Burner")
	ap.add_argument("id", help="firmware id in scripts/burner.json, e.g. words")
	ap.add_argument("--version", required=True, help="version name, e.g. 1.0.0 (no leading v)")
	ap.add_argument("--notes", help="release notes (markdown); default: the version")
	ap.add_argument("--bin", help="image to upload; default dist/burner/<id>-<version>.bin")
	ap.add_argument("--private", action="store_true", help="upload as PRIVATE instead of PUBLIC")
	ap.add_argument("--yes", action="store_true", help="really upload; without it only print what would be sent")
	args = ap.parse_args()

	if args.version.lower().startswith("v"):
		ap.error("version without the leading v (M5Burner shows it as v<version>)")
	config = json.loads((ROOT / "scripts/burner.json").read_text(encoding="utf-8"))
	entry = config["firmwares"].get(args.id)
	if not entry:
		ap.error(f"{args.id} is not in scripts/burner.json")
	image = Path(args.bin) if args.bin else ROOT / "dist/burner" / f"{args.id}-{args.version}.bin"
	if not image.is_file():
		raise SystemExit(f"missing {image}; run: CADV_VERSION={args.version} ./do.sh burner {args.id}")
	payload = image.read_bytes()
	if payload[:1] != b"\xe9" or len(payload) < 0x10000 or payload[0x8000:0x8002] != b"\xaa\x50":
		raise SystemExit(f"{image} is not a merged image (bootloader at 0x0, partition table at 0x8000)")

	firmware_id = entry.get("firmwareId")
	token = login() if args.yes else None
	if firmware_id:
		if token:
			info = call("GET", f"/firmwares/{firmware_id}", token)
		else:
			info = call("GET", f"/firmwares/{firmware_id}")
		current = (info.get("currentVersion") or {}).get("versionName")
		if current == args.version:
			raise SystemExit(f"{info['firmwareName']} is already at {current}")
		form = {
			"firmwareName": info["firmwareName"],
			"sourceUrl": info.get("sourceUrl") or config.get("sourceUrl", ""),
			"categoryIds": json.dumps([c["categoryId"] for c in info.get("categories") or []]),
			"deviceIds": json.dumps([d["deviceId"] for d in info.get("supportedDevices") or []]),
		}
		what = f"new version of {info['firmwareName']} (now {current})"
	else:
		description = (ROOT / entry["description"]).read_text(encoding="utf-8").strip()
		form = {
			"firmwareName": entry["name"],
			"firmwareDescription": markdown(description),
			"sourceUrl": config.get("sourceUrl", ""),
			"categoryIds": json.dumps(entry["categories"]),
			"deviceIds": json.dumps([config["device"]]),
		}
		what = f"new listing {entry['name']}"
	form["versionName"] = args.version
	form["versionDescription"] = markdown(args.notes or args.version)
	form["visibility"] = "PRIVATE" if args.private else "PUBLIC"

	cover = ROOT / "fw" / args.id / "cover.png"
	print(f"{what}: {image.name} ({len(payload) / 1048576:.1f}MB) as {args.version}, {form['visibility']}")
	print(f"  cover: {cover.relative_to(ROOT) if cover.is_file() else 'none (./do.sh shot ' + args.id + ')'}")
	for k, v in form.items():
		print(f"  {k}: {v if len(v) < 120 else v[:117] + '...'}")
	if not args.yes:
		print("dry run; add --yes to upload")
		return
	files = {"binFile": (image.name, payload)}
	cover = ROOT / "fw" / args.id / "cover.png"
	if cover.is_file():
		files["coverFile"] = (cover.name, cover.read_bytes())
	result = call("POST", "/firmwares", token, form, files) or {}
	print(
		f"uploaded: firmwareId={result.get('firmwareId')} versionId={result.get('versionId')} "
		f"status={result.get('status')}"
	)
	if not firmware_id and result.get("firmwareId"):
		print(f'put "firmwareId": "{result["firmwareId"]}" under {args.id} in scripts/burner.json')


if __name__ == "__main__":
	main()

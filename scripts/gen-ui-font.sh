#!/usr/bin/env bash
# Generate shared/fonts/UI-Bold-N and Gloss-Bold-28 from Source Han Sans SC Bold,
# Word-Bold-48/32 from JetBrains Mono Bold (WORD_FONT) for the spelling puzzle,
# and Ipa-Bold-20/28 from Arial Bold for the phonetic lines.
#
# Source Han Sans VF's default instance is ExtraLight (wght 250). fontbm
# rasterizes that master, which is too thin on a 240×135 panel. Pin the
# Bold instance (wght 700) before rasterizing. Needs hb-subset, or fontTools.
#
# Usage:
#   ./scripts/gen-ui-font.sh
#   ./scripts/gen-ui-font.sh --size 20
#   ./scripts/gen-ui-font.sh --font /path/to/SourceHanSansSC-Bold.otf
#   ./scripts/gen-ui-font.sh --mono
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/log.sh
source "$ROOT/scripts/lib/log.sh"

OUT_DIR="$ROOT/shared/fonts"
# File names are UI-Bold-20 / Word-Bold-48 / Word-Bold-32 / Gloss-Bold-28 / Ipa-Bold-20 / Ipa-Bold-28.
# Styles must say e.g. "bold 20px UI", "bold 48px Word", "bold 28px Gloss", "bold 20px Ipa".
FAMILY="UI"
SIZE=20
MONO=0
STALE_CHECK=0
FONT_FILE="${UI_FONT:-$HOME/Library/Fonts/SourceHanSans-VF.otf.ttc}"
SC_INDEX=2
# Named instance Bold. Default master of the VF is ExtraLight (250).
WEIGHT=700
FONTBM_VER="10.0.2"
# Puzzle sizes, largest first. Styles say "bold 48px Word" / "bold 32px Word".
WORD_SIZES="48 32"
# Puzzle face is monospace: a blank `_` is as wide as any letter, so the centered
# line does not shift while typing, and JetBrains Mono leaves a gap between
# adjacent `_` so blanks stay countable. Static TTF, no weight pinning.
WORD_FONT="${WORD_FONT:-$HOME/Library/Fonts/JetBrainsMono-Bold.ttf}"
# Words top-line gloss. Style says "bold 28px Gloss". Only quiz-bank and words-firmware glyphs.
GLOSS_SIZE=28
# Phonetic sizes: 20 for dict, 28 for the words top line.
IPA_SIZES="20 28"
CHARS_EXTRA="年月日周闰初十廿卅冬腊设闹钟等待对时℃"
# UI glyphs come from firmware text and wordbank-chars.txt. phone-chars.txt is IPA-only and is not included here.
CHAR_SOURCES=()
while IFS= read -r _src; do
  CHAR_SOURCES+=("$_src")
done < <(find "$ROOT/fw" "$ROOT/shared" \( -name '*.ts' -o -name 'wordbank-chars.txt' \) | sort)

usage() {
  sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --size) SIZE="${2:?}"; shift 2 ;;
    --font) FONT_FILE="${2:?}"; shift 2 ;;
    --mono) MONO=1; shift ;;
    --stale) STALE_CHECK=1; shift ;;
    -h | --help | help) usage 0 ;;
    *)
      log_error "未知参数：$1"
      usage 1
      ;;
  esac
done

# Staleness is a fingerprint of the glyph sets and font files, not mtimes:
# editing a .ts without new characters must not rebuild every image.
KEY_FILE="$ROOT/.cache/ui-font.key"

font_key() {
  local ipa_src="${IPA_FONT:-/System/Library/Fonts/Supplemental/Arial Bold.ttf}"
  ROOT="$ROOT" SCRIPT="${BASH_SOURCE[0]}" python3 - "$FONT_FILE" "$WORD_FONT" "$ipa_src" "${CHAR_SOURCES[@]}" <<'PY'
import hashlib, os, sys
root = os.environ["ROOT"]
fonts, sources = sys.argv[1:4], sys.argv[4:]
def chars(paths):
    out = set()
    for p in paths:
        try:
            out |= set(open(p, encoding="utf-8", errors="replace").read())
        except OSError:
            pass
    return "".join(sorted(out))
gloss = [p for p in sources if p.startswith(root + "/fw/words/") and p.endswith(".ts")
         or os.path.dirname(p) == root + "/shared" and p.endswith(".ts")]
gloss.append(root + "/fw/words/wordbank-chars.txt")
h = hashlib.sha256()
h.update(open(os.environ["SCRIPT"], "rb").read())
for f in fonts:
    try:
        st = os.stat(f)
        h.update(f"{f}\0{st.st_size}\0{int(st.st_mtime)}\0".encode())
    except OSError:
        h.update(f"{f}\0missing\0".encode())
for part in (chars(sources), chars(gloss), chars([root + "/fw/words/phone-chars.txt"])):
    h.update(part.encode("utf-8") + b"\0")
print(h.hexdigest())
PY
}

# Move a new output into shared/fonts/ only when its bytes changed, so the
# image builds keyed on shared/ mtimes stay current.
CHANGED=0
install_out() {
  local src="$1" dest="$OUT_DIR/$(basename "$1")"
  if [ -f "$dest" ] && cmp -s "$src" "$dest"; then
    rm -f "$src"
  else
    mv "$src" "$dest"
    CHANGED=$((CHANGED + 1))
  fi
}

# Delete old outputs of a family except the stems just generated.
prune_family() {
  local family="$1" f base keep
  shift
  for f in "$OUT_DIR/${family}-Regular-"*.* "$OUT_DIR/${family}-Bold-"*.*; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    base="${base%.*}"
    keep=0
    for stem in "$@"; do
      [ "$base" = "$stem" ] && keep=1
    done
    [ "$keep" -eq 1 ] || { rm -f "$f"; CHANGED=$((CHANGED + 1)); }
  done
}

# fontbm warns for tab / newline in the char files. Hide that, keep the rest.
run_fontbm() {
  local out rc=0
  out="$("$FONTBM" "$@" 2>&1)" || rc=$?
  printf '%s\n' "$out" | grep -Ev '^warning: glyph (9|10|13) not found\.?$' | grep -v '^$' >&2 || true
  return "$rc"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || log_die "缺少命令：$1"
}

# Prefer FONTBM, then PATH, then repo-local third_party/bin/fontbm; else download.
ensure_fontbm() {
  if [ -n "${FONTBM:-}" ] && [ -x "$FONTBM" ]; then
    return 0
  fi
  if command -v fontbm >/dev/null 2>&1; then
    FONTBM="$(command -v fontbm)"
    return 0
  fi
  local local_bin="$ROOT/third_party/bin/fontbm"
  if [ -x "$local_bin" ]; then
    FONTBM="$local_bin"
    return 0
  fi

  need_cmd curl
  need_cmd unzip
  local arch zip tmp
  case "$(uname -m)" in
    arm64 | aarch64) zip="moddable-tools-mac64arm.zip" ;;
    x86_64) zip="moddable-tools-mac64.zip" ;;
    *) log_die "不支持的架构：$(uname -m)（请自行安装 fontbm 并设置 FONTBM）" ;;
  esac
  tmp="$(mktemp -d)"
  log_info "下载 fontbm（Moddable SDK ${FONTBM_VER}）…"
  curl -fsSL -o "$tmp/tools.zip" \
    "https://github.com/Moddable-OpenSource/moddable/releases/download/${FONTBM_VER}/${zip}"
  unzip -qo "$tmp/tools.zip" fontbm -d "$tmp"
  mkdir -p "$(dirname "$local_bin")"
  mv "$tmp/fontbm" "$local_bin"
  chmod +x "$local_bin"
  rm -rf "$tmp"
  FONTBM="$local_bin"
  log_success "fontbm → $FONTBM"
}

# Pin wght=WEIGHT and, for a TTC, the SC face. Static fonts are copied through.
pin_bold() {
  local src="$1" dest="$2" face="$3"
  if command -v hb-subset >/dev/null 2>&1; then
    if hb-subset --font-file "$src" -y "$face" --unicodes='*' --variations="wght=${WEIGHT}" -o "$dest" 2>"$WORK_DIR/pin.err"; then
      return 0
    fi
    log_warn "hb-subset 未能固定字重：$(tr '\n' ' ' <"$WORK_DIR/pin.err")"
  fi
  local py="" cand
  for cand in /usr/bin/python3 python3; do
    if "$cand" -c 'import fontTools.varLib.instancer' >/dev/null 2>&1; then
      py="$cand"
      break
    fi
  done
  if [ -z "$py" ]; then
    log_die "无法固定 Bold。安装 hb-subset（brew install harfbuzz）或 fontTools"
  fi
  SRC="$src" DEST="$dest" FACE="$face" WEIGHT="$WEIGHT" "$py" - <<'PY'
import os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
src, dest = os.environ["SRC"], os.environ["DEST"]
face, weight = int(os.environ["FACE"]), float(os.environ["WEIGHT"])
font = TTFont(src, fontNumber=face)
if "fvar" in font:
    instantiateVariableFont(font, {"wght": weight}, inplace=True)
font.save(dest)
PY
}

# BMFont binary: rewrite info.fontName to FAMILY ("UI") so Style { font: "20px UI" } matches.
bmf_set_family() {
  local fnt="$1" family="$2"
  FNT="$fnt" FAMILY="$family" perl -e '
    use strict; use warnings;
    open my $fh, "<:raw", $ENV{FNT} or die $!;
    local $/; my $raw = <$fh>; close $fh;
    die "not BMF\n" unless substr($raw, 0, 3) eq "BMF";
    my $ver = ord(substr($raw, 3, 1));
    die "unsupported BMF ver $ver\n" unless $ver == 3;
    my $i = 4;
    my @blocks;
    while ($i < length($raw)) {
      my ($t, $n) = unpack("CV", substr($raw, $i, 5));
      $i += 5;
      my $data = substr($raw, $i, $n);
      $i += $n;
      if ($t == 1) {
        die "info block too short\n" if length($data) < 14;
        $data = substr($data, 0, 14) . $ENV{FAMILY} . "\0";
      }
      push @blocks, [$t, $data];
    }
    open my $out, ">:raw", $ENV{FNT} or die $!;
    print $out "BMF", chr(3);
    for my $b (@blocks) {
      print $out pack("CV", $b->[0], length($b->[1])), $b->[1];
    }
    close $out;
  '
}

main() {
  need_cmd perl
  ensure_fontbm
  [ -f "$FONT_FILE" ] || log_die "font not found: $FONT_FILE"

  local out_stem="${FAMILY}-Bold-${SIZE}"
  local chars_extra font_use face nglyphs
  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cadv-ui-font.XXXXXX")"
  trap 'rm -rf "${WORK_DIR:-}"' EXIT

  chars_extra="$WORK_DIR/extra.txt"
  printf '%s' "$CHARS_EXTRA" >"$chars_extra"

  font_use="$WORK_DIR/font-bold"
  face=0
  if [[ "$FONT_FILE" == *.ttc || "$FONT_FILE" == *.otc ]]; then
    face="$SC_INDEX"
    log_info "TTC → SC face (index ${SC_INDEX})，Bold wght=${WEIGHT}"
  else
    log_info "Bold wght=${WEIGHT}"
  fi
  pin_bold "$FONT_FILE" "$font_use" "$face"

  mkdir -p "$OUT_DIR"
  local -a args=(
    --font-file "$font_use"
    --font-size "$SIZE"
    --output "$WORK_DIR/$out_stem"
    --texture-crop-width
    --texture-crop-height
    --texture-name-suffix none
    --data-format bin
    --chars 32-126
    --chars-file "$chars_extra"
  )
  local f
  for f in "${CHAR_SOURCES[@]}"; do
    [ -f "$f" ] && args+=(--chars-file "$f")
  done
  [ "$MONO" -eq 1 ] && args+=(--monochrome)

  log_info "fontbm size=${SIZE} → ${out_stem}"
  run_fontbm "${args[@]}"

  [ -f "$WORK_DIR/${out_stem}.fnt" ] && [ -f "$WORK_DIR/${out_stem}.png" ] \
    || log_die "fontbm 未生成 ${out_stem}.{fnt,png}"

  bmf_set_family "$WORK_DIR/${out_stem}.fnt" "$FAMILY"

  prune_family "$FAMILY" "$out_stem"
  install_out "$WORK_DIR/${out_stem}.fnt"
  install_out "$WORK_DIR/${out_stem}.png"

  nglyphs="$(FNT="$OUT_DIR/${out_stem}.fnt" perl -e '
    open my $fh, "<:raw", $ENV{FNT} or die $!;
    local $/; my $raw = <$fh>;
    my $i = 4;
    while ($i < length($raw)) {
      my ($t, $n) = unpack("CV", substr($raw, $i, 5));
      $i += 5;
      if ($t == 4) { print int($n / 20); exit 0 }
      $i += $n;
    }
    print 0;
  ')"
  log_success "wrote ${out_stem} glyphs=${nglyphs} → shared/fonts/ (family=${FAMILY})"

  # Puzzle faces. Middle band is 240×71. The words firmware measures each
  # headword and picks the largest that fits: 48px, then 32px, then 20px UI.
  local word_family="Word" word_size word_stem
  [ -f "$WORD_FONT" ] || log_die "填空字体不存在：${WORD_FONT}（可设置 WORD_FONT，默认 JetBrains Mono Bold）"
  local word_stems=()
  for word_size in $WORD_SIZES; do word_stems+=("Word-Bold-${word_size}"); done
  prune_family Word "${word_stems[@]}"
  for word_size in $WORD_SIZES; do
    word_stem="Word-Bold-${word_size}"
    log_info "fontbm size=${word_size} → ${word_stem} (puzzle)"
    run_fontbm \
      --font-file "$WORD_FONT" \
      --font-size "$word_size" \
      --output "$WORK_DIR/$word_stem" \
      --texture-crop-width \
      --texture-crop-height \
      --texture-name-suffix none \
      --data-format bin \
      --chars 32-126
    [ -f "$WORK_DIR/${word_stem}.fnt" ] && [ -f "$WORK_DIR/${word_stem}.png" ] \
      || log_die "fontbm 未生成 ${word_stem}.{fnt,png}"
    bmf_set_family "$WORK_DIR/${word_stem}.fnt" "$word_family"
    install_out "$WORK_DIR/${word_stem}.fnt"
    install_out "$WORK_DIR/${word_stem}.png"
    log_success "wrote ${word_stem} → shared/fonts/ (family=${word_family})"
  done

  # Gloss face. Words top band is 240×64; 20px UI left most of it empty.
  # Hanzi only from the quiz banks and the words / shared UI text, so the
  # bigger face stays near the bank's ~1.3k glyphs instead of every firmware's.
  local gloss_stem="Gloss-Bold-${GLOSS_SIZE}" gloss_family="Gloss"
  local -a gloss_args=(
    --font-file "$font_use"
    --font-size "$GLOSS_SIZE"
    --output "$WORK_DIR/$gloss_stem"
    --texture-crop-width
    --texture-crop-height
    --texture-name-suffix none
    --data-format bin
    --chars 32-126
    --chars-file "$chars_extra"
    --chars-file "$ROOT/fw/words/wordbank-chars.txt"
  )
  for f in "$ROOT"/fw/words/*.ts "$ROOT"/shared/*.ts; do
    [ -f "$f" ] && gloss_args+=(--chars-file "$f")
  done
  [ "$MONO" -eq 1 ] && gloss_args+=(--monochrome)
  log_info "fontbm size=${GLOSS_SIZE} → ${gloss_stem} (gloss)"
  run_fontbm "${gloss_args[@]}"
  [ -f "$WORK_DIR/${gloss_stem}.fnt" ] && [ -f "$WORK_DIR/${gloss_stem}.png" ] \
    || log_die "fontbm 未生成 ${gloss_stem}.{fnt,png}"
  bmf_set_family "$WORK_DIR/${gloss_stem}.fnt" "$gloss_family"
  prune_family Gloss "$gloss_stem"
  install_out "$WORK_DIR/${gloss_stem}.fnt"
  install_out "$WORK_DIR/${gloss_stem}.png"
  log_success "wrote ${gloss_stem} → shared/fonts/ (family=${gloss_family})"

  # Phonetic faces. Family Ipa: dict uses "bold 20px Ipa", words "bold 28px Ipa"
  # to match its 28px gloss.
  local ipa_src="${IPA_FONT:-/System/Library/Fonts/Supplemental/Arial Bold.ttf}"
  local ipa_stem ipa_family="Ipa"
  local phone_chars="$ROOT/fw/words/phone-chars.txt"
  [ -f "$ipa_src" ] || log_die "IPA 字体不存在：${ipa_src}（可设置 IPA_FONT）"
  if [ -s "$phone_chars" ] && command -v hb-shape >/dev/null 2>&1; then
    local miss
    miss="$(IPA_FONT="$ipa_src" PHONE_CHARS="$phone_chars" python3 - <<'PY'
import os, subprocess
font = os.environ["IPA_FONT"]
chars = open(os.environ["PHONE_CHARS"], encoding="utf-8").read()
bad = []
seen = set()
for ch in chars:
    if ch.isspace() or ch in seen:
        continue
    seen.add(ch)
    cp = f"{ord(ch):04x}"
    out = subprocess.check_output(["hb-shape", "--font-file", font, "-u", cp], text=True)
    if ".notdef" in out:
        bad.append(ch)
print("".join(bad))
PY
)"
    [ -z "$miss" ] || log_die "Arial Bold 缺少音标字形：$miss"
  fi
  local ipa_size
  local ipa_stems=()
  for ipa_size in $IPA_SIZES; do ipa_stems+=("Ipa-Bold-${ipa_size}"); done
  prune_family Ipa "${ipa_stems[@]}"
  for ipa_size in $IPA_SIZES; do
    ipa_stem="Ipa-Bold-${ipa_size}"
    log_info "fontbm size=${ipa_size} → ${ipa_stem} (phonetic)"
    local -a ipa_args=(
      --font-file "$ipa_src"
      --font-size "$ipa_size"
      --output "$WORK_DIR/$ipa_stem"
      --texture-crop-width
      --texture-crop-height
      --texture-name-suffix none
      --data-format bin
      --chars 32-126
    )
    [ -s "$phone_chars" ] && ipa_args+=(--chars-file "$phone_chars")
    run_fontbm "${ipa_args[@]}"
    [ -f "$WORK_DIR/${ipa_stem}.fnt" ] && [ -f "$WORK_DIR/${ipa_stem}.png" ] \
      || log_die "fontbm 未生成 ${ipa_stem}.{fnt,png}"
    bmf_set_family "$WORK_DIR/${ipa_stem}.fnt" "$ipa_family"
    install_out "$WORK_DIR/${ipa_stem}.fnt"
    install_out "$WORK_DIR/${ipa_stem}.png"
    log_success "wrote ${ipa_stem} → shared/fonts/ (family=${ipa_family})"
  done
}

# Exit 0 when every output exists and the fingerprint matches the last run.
fonts_current() {
  local stem
  for stem in "${FAMILY}-Bold-${SIZE}" "Gloss-Bold-${GLOSS_SIZE}"; do
    [ -f "$OUT_DIR/$stem.fnt" ] || return 1
  done
  for stem in $WORD_SIZES; do
    [ -f "$OUT_DIR/Word-Bold-$stem.fnt" ] || return 1
  done
  for stem in $IPA_SIZES; do
    [ -f "$OUT_DIR/Ipa-Bold-$stem.fnt" ] || return 1
  done
  [ -f "$KEY_FILE" ] || return 1
  [ "$(font_key)" = "$(cat "$KEY_FILE")" ]
}

if [ "$STALE_CHECK" -eq 1 ]; then
  if fonts_current; then
    exit 0
  fi
  exit 1
fi

WORK_DIR=""
KEY="$(font_key)"
main
mkdir -p "$(dirname "$KEY_FILE")"
printf '%s\n' "$KEY" >"$KEY_FILE"
if [ "$CHANGED" -eq 0 ]; then
  log_success "字体内容没变，shared/fonts/ 保持原样（固件不用重编）"
else
  log_success "shared/fonts/ 更新了 ${CHANGED} 个文件"
fi

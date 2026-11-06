#!/usr/bin/env bash
# Generate shared/fonts/UI-Bold-N and Word-Bold-48 from Source Han Sans SC Bold.
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
# File names are UI-Bold-20 / Word-Bold-48. Styles must say "bold 20px UI"
# and "bold 48px Word". "20px UI" looks up UI-Regular-20, which this script removes.
FAMILY="UI"
SIZE=20
MONO=0
STALE_CHECK=0
FONT_FILE="${UI_FONT:-$HOME/Library/Fonts/SourceHanSans-VF.otf.ttc}"
SC_INDEX=2
# Named instance Bold. Default master of the VF is ExtraLight (250).
WEIGHT=700
FONTBM_VER="10.0.2"
CHARS_EXTRA="年月日周闰初十廿卅冬腊设闹钟等待对时℃"
# Every firmware and shared module contributes glyphs, so a new fw/ folder is picked up.
CHAR_SOURCES=()
while IFS= read -r _src; do
  CHAR_SOURCES+=("$_src")
done < <(find "$ROOT/fw" "$ROOT/shared" \( -name '*.ts' -o -name 'wordbank-chars.txt' \) | sort)

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
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
  "$FONTBM" "${args[@]}"

  [ -f "$WORK_DIR/${out_stem}.fnt" ] && [ -f "$WORK_DIR/${out_stem}.png" ] \
    || log_die "fontbm 未生成 ${out_stem}.{fnt,png}"

  bmf_set_family "$WORK_DIR/${out_stem}.fnt" "$FAMILY"

  find "$OUT_DIR" -maxdepth 1 -type f \( -name "${FAMILY}-Regular-*.*" -o -name "${FAMILY}-Bold-*.*" \) -delete
  mv "$WORK_DIR/${out_stem}.fnt" "$OUT_DIR/"
  mv "$WORK_DIR/${out_stem}.png" "$OUT_DIR/"

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

  # Puzzle face. Middle band is 240×71. Bold 48px: widest 7-letter headword
  # ("maximum") is 238px, so 8 letters and longer drop to 20px UI.
  local word_size=48 word_family="Word" word_stem="Word-Bold-48"
  log_info "fontbm size=${word_size} → ${word_stem} (puzzle)"
  "$FONTBM" \
    --font-file "$font_use" \
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
  find "$OUT_DIR" -maxdepth 1 -type f \( -name "Word-Regular-*.*" -o -name "Word-Bold-*.*" \) -delete
  mv "$WORK_DIR/${word_stem}.fnt" "$OUT_DIR/"
  mv "$WORK_DIR/${word_stem}.png" "$OUT_DIR/"
  log_success "wrote ${word_stem} → shared/fonts/ (family=${word_family})"
}

# Exit 0 when both faces are at least as new as the script, the glyph sources, and the font file.
fonts_current() {
  local ui="$OUT_DIR/${FAMILY}-Bold-${SIZE}.fnt"
  local word="$OUT_DIR/Word-Bold-48.fnt"
  local oldest src
  [ -f "$ui" ] && [ -f "$word" ] || return 1
  oldest="$ui"
  [ "$word" -ot "$oldest" ] && oldest="$word"
  for src in "${BASH_SOURCE[0]}" "${CHAR_SOURCES[@]}"; do
    [ -e "$src" ] || continue
    [ "$src" -nt "$oldest" ] && return 1
  done
  if [ -e "$FONT_FILE" ] && [ "$FONT_FILE" -nt "$oldest" ]; then
    return 1
  fi
  return 0
}

if [ "$STALE_CHECK" -eq 1 ]; then
  if fonts_current; then
    exit 0
  fi
  exit 1
fi

WORK_DIR=""
main

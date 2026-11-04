#!/usr/bin/env bash
# Generate app/fonts/UI-Regular-N BMFont from Source Han Sans SC via fontbm.
#
# Usage:
#   ./scripts/gen-ui-font.sh
#   ./scripts/gen-ui-font.sh --size 20
#   ./scripts/gen-ui-font.sh --font /path/to/SourceHanSansSC-Medium.otf
#   ./scripts/gen-ui-font.sh --mono
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/log.sh
source "$ROOT/scripts/lib/log.sh"

OUT_DIR="$ROOT/app/fonts"
FAMILY="UI"
SIZE=20
MONO=0
FONT_FILE="${UI_FONT:-$HOME/Library/Fonts/SourceHanSans-VF.otf.ttc}"
SC_INDEX=2
FONTBM_VER="10.0.2"
CHARS_EXTRA="年月日周闰初十廿卅冬腊设闹钟等待对时℃"
CHAR_SOURCES=(
  "$ROOT/app/main.ts"
  "$ROOT/app/weather.ts"
  "$ROOT/app/settings.ts"
  "$ROOT/app/netboot.ts"
  "$ROOT/app/keyboard_stub.ts"
  "$ROOT/app/sound_stub.ts"
)

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --size) SIZE="${2:?}"; shift 2 ;;
    --font) FONT_FILE="${2:?}"; shift 2 ;;
    --mono) MONO=1; shift ;;
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

# Source Han Sans VF is a TTC; fontbm always opens face 0. Rewrite a temp copy so
# face 0 is Source Han Sans SC (index SC_INDEX) while keeping absolute table offsets.
prepare_font() {
  local src="$1" dest="$2" index="$3"
  case "$src" in
    *.ttc | *.otc)
      need_cmd perl
      SC_INDEX="$index" SRC="$src" DEST="$dest" perl -e '
        use strict; use warnings;
        open my $fh, "<:raw", $ENV{SRC} or die $!;
        local $/; my $data = <$fh>; close $fh;
        die "not ttc\n" unless substr($data, 0, 4) eq "ttcf";
        my $num = unpack("N", substr($data, 8, 4));
        my $idx = $ENV{SC_INDEX} + 0;
        die "face $idx out of range (n=$num)\n" if $idx < 0 || $idx >= $num;
        my $off = unpack("N", substr($data, 12 + 4 * $idx, 4));
        substr($data, 8, 4) = pack("N", 1);
        substr($data, 12, 4) = pack("N", $off);
        open my $out, ">:raw", $ENV{DEST} or die $!;
        print $out $data; close $out;
      '
      ;;
    *)
      cp "$src" "$dest"
      ;;
  esac
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

  local out_stem="${FAMILY}-Regular-${SIZE}"
  local chars_extra font_use nglyphs
  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/cadv-ui-font.XXXXXX")"
  trap 'rm -rf "${WORK_DIR:-}"' EXIT

  chars_extra="$WORK_DIR/extra.txt"
  printf '%s' "$CHARS_EXTRA" >"$chars_extra"

  font_use="$WORK_DIR/font-input"
  if [[ "$FONT_FILE" == *.ttc || "$FONT_FILE" == *.otc ]]; then
    log_info "TTC → SC face (index ${SC_INDEX})"
    prepare_font "$FONT_FILE" "$font_use" "$SC_INDEX"
  else
    font_use="$FONT_FILE"
  fi

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

  find "$OUT_DIR" -maxdepth 1 -type f -name "${FAMILY}-Regular-*.*" -delete
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
  log_success "wrote ${out_stem} glyphs=${nglyphs} → app/fonts/ (family=${FAMILY})"
}

WORK_DIR=""
main

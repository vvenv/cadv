#!/usr/bin/env bash
# Generate fw/repl/fonts/Code-Bold-$SIZE from JetBrains Mono Bold, ASCII only.
# Style says "bold 20px Code". 12 px advance, so 19 columns on the 240 px panel.
# SIZE=NN overrides the pixel size (then update FONT_CODE and the grid in fw/repl/view.ts).
#
# Usage:
#   ./scripts/gen-code-font.sh
#   CODE_FONT=/path/to/Mono-Bold.ttf ./scripts/gen-code-font.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/log.sh
source "$ROOT/scripts/lib/log.sh"

OUT_DIR="$ROOT/fw/repl/fonts"
SIZE="${SIZE:-20}"
FAMILY="Code"
CODE_FONT="${CODE_FONT:-$HOME/Library/Fonts/JetBrainsMono-Bold.ttf}"
FONTBM="${FONTBM:-$(command -v fontbm || echo "$ROOT/third_party/bin/fontbm")}"

[ -x "$FONTBM" ] || log_die "缺少 fontbm（先跑一次 ./do.sh gen-font，或设置 FONTBM）"
[ -f "$CODE_FONT" ] || log_die "字体不存在：${CODE_FONT}（可设置 CODE_FONT）"

work="$(mktemp -d "${TMPDIR:-/tmp}/cadv-code-font.XXXXXX")"
trap 'rm -rf "$work"' EXIT
stem="${FAMILY}-Bold-${SIZE}"

"$FONTBM" \
  --font-file "$CODE_FONT" \
  --font-size "$SIZE" \
  --output "$work/$stem" \
  --texture-crop-width \
  --texture-crop-height \
  --texture-name-suffix none \
  --data-format bin \
  --chars 32-126 >/dev/null

# BMFont binary: rewrite info.fontName so Style { font: "bold 20px Code" } matches.
FNT="$work/$stem.fnt" FAMILY="$FAMILY" perl -e '
  use strict; use warnings;
  open my $fh, "<:raw", $ENV{FNT} or die $!;
  local $/; my $raw = <$fh>; close $fh;
  die "not BMF v3\n" unless substr($raw, 0, 4) eq "BMF\x03";
  my $i = 4; my $out = "BMF\x03";
  while ($i < length($raw)) {
    my ($t, $n) = unpack("CV", substr($raw, $i, 5));
    my $data = substr($raw, $i + 5, $n);
    $i += 5 + $n;
    $data = substr($data, 0, 14) . $ENV{FAMILY} . "\0" if $t == 1;
    $out .= pack("CV", $t, length($data)) . $data;
  }
  open my $o, ">:raw", $ENV{FNT} or die $!;
  print $o $out;
'

mkdir -p "$OUT_DIR"
mv "$work/$stem.fnt" "$work/$stem.png" "$OUT_DIR/"
log_success "wrote ${stem} → fw/repl/fonts/ (family=${FAMILY})"

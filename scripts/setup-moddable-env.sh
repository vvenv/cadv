#!/usr/bin/env bash
set -euo pipefail
ZSHRC="${HOME}/.zshrc"
MARKER_BEGIN="# >>> cadv moddable >>>"
MARKER_END="# <<< cadv moddable <<<"
MODDABLE_DIR="${HOME}/vvenv/cadv/third_party/moddable"
IDF_DIR="${HOME}/esp32/esp-idf-v6.1"
block=$(cat <<EOB
${MARKER_BEGIN}
export MODDABLE="${MODDABLE_DIR}"
export PATH="/opt/homebrew/opt/python@3.12/libexec/bin:/opt/homebrew/opt/python@3.12/bin:\${MODDABLE}/build/bin/mac/release:\$PATH"
export IDF_PATH="${IDF_DIR}"
# Espressif CDN (faster tool downloads than github.com)
export IDF_GITHUB_ASSETS="dl.espressif.com/github_assets"
# Uncomment to always load ESP-IDF (slow):
# [[ -f "\$IDF_PATH/export.sh" ]] && source "\$IDF_PATH/export.sh" >/dev/null
${MARKER_END}
EOB
)
touch "$ZSHRC"
if grep -q "$MARKER_BEGIN" "$ZSHRC" 2>/dev/null; then
  tmp="$(mktemp)"
  awk -v b="$MARKER_BEGIN" -v e="$MARKER_END" '$0==b{skip=1;next} $0==e{skip=0;next} !skip{print}' "$ZSHRC" >"$tmp"
  printf '\n%s\n' "$block" >>"$tmp"
  mv "$tmp" "$ZSHRC"
  echo updated
else
  printf '\n%s\n' "$block" >>"$ZSHRC"
  echo appended
fi

#!/usr/bin/env bash
# cadv 常用命令入口。无参数进入交互菜单；具体做法仍在本脚本命令函数里，这里做转发。
#
# TypeScript / Moddable（Cardputer-Adv 时钟）:
#   ./do.sh ts-sim                  # 桌面模拟器跑 app
#   ./do.sh ts-flash                # 烧到 esp32/esp32s3（USB；Wi-Fi 见 app/wifi.local.json）
#   ./do.sh ts-check                # 检查 MODDABLE / mcconfig
#   ./do.sh port                    # 列出可用串口
#   ./do.sh gen-font                # 用 fontbm 生成 app/fonts/UI-Regular-20
#   ./do.sh clean                   # 清临时日志
#   ./do.sh help                    # 本说明
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

LOG_TAG=cadv
# shellcheck source=scripts/lib/log.sh
source "$ROOT/scripts/lib/log.sh"
# shellcheck source=scripts/lib/prompt-menu.sh
source "$ROOT/scripts/lib/prompt-menu.sh"

APP_DIR="$ROOT/app"

export PATH="/opt/homebrew/bin:${HOME}/Library/Python/3.9/bin:${PATH}"
export HOMEBREW_PREFIX="${HOMEBREW_PREFIX:-/opt/homebrew}"

usage() {
  sed -n '2,/^set -euo pipefail$/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

pause_menu() {
  [ -t 0 ] || return 0
  echo ""
  read -r -p "按回车返回菜单…" _ </dev/tty || true
}

# ---------- helpers ----------

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || log_die "缺少命令：$1"
}

detect_port() {
  local ports=() p
  for p in /dev/cu.usbmodem* /dev/cu.wchusbserial* /dev/cu.usbserial*; do
    [ -e "$p" ] || continue
    ports+=("$p")
  done
  if [ "${#ports[@]}" -eq 0 ]; then
    return 1
  fi
  if [ "${#ports[@]}" -eq 1 ]; then
    printf '%s\n' "${ports[0]}"
    return 0
  fi
  log_warn "多个串口：${ports[*]} — 使用第一个"
  printf '%s\n' "${ports[0]}"
}

# ---------- commands ----------

cmd_port() {
  local found=0 p
  for p in /dev/cu.usbmodem* /dev/cu.wchusbserial* /dev/cu.usbserial*; do
    [ -e "$p" ] || continue
    echo "$p"
    found=1
  done
  if [ "$found" -eq 0 ]; then
    log_warn "没有可用串口"
    return 1
  fi
}

cmd_clean() {
  rm -f /tmp/cadv-sim.log /tmp/sim_*.log /tmp/cardputer_*.log /tmp/clock_*.log 2>/dev/null || true
  log_success "已清理临时日志"
}

cmd_gen_font() {
  "$ROOT/scripts/gen-ui-font.sh" "$@"
}

# ---------- Moddable / TypeScript ----------

need_moddable() {
  if [ -z "${MODDABLE:-}" ] || [ ! -d "${MODDABLE:-}" ]; then
    if [ -d "$ROOT/third_party/moddable" ]; then
      export MODDABLE="$ROOT/third_party/moddable"
    else
      log_die "未设置 MODDABLE。先按 app/README.md 安装 Moddable SDK，并 export MODDABLE=..."
    fi
  fi
  # ensure mcconfig on PATH (common mac layout)
  if ! command -v mcconfig >/dev/null 2>&1; then
    local cand="$MODDABLE/build/bin/mac/release"
    [ -d "$cand" ] && export PATH="$cand:$PATH"
  fi
  command -v mcconfig >/dev/null 2>&1 || log_die "找不到 mcconfig（MODDABLE=${MODDABLE}）"
}

# Prints ssid=… / password=… lines for mcconfig from env or wifi.local.json.
ts_wifi_args() {
  local ssid="${WIFI_SSID:-}" password="${WIFI_PASSWORD:-}" file="$APP_DIR/wifi.local.json"
  if [ -z "$ssid" ] && [ -f "$file" ]; then
    ssid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1],encoding="utf-8")).get("ssid") or "")' "$file")"
    password="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1],encoding="utf-8")).get("password") or "")' "$file")"
  fi
  [ -n "$ssid" ] || return 0
  printf '%s\n' "ssid=$ssid"
  printf '%s\n' "password=$password"
}

cmd_ts_check() {
  if [ -z "${MODDABLE:-}" ]; then
    if [ -d "$ROOT/third_party/moddable" ]; then
      export MODDABLE="$ROOT/third_party/moddable"
    else
      log_warn "MODDABLE 未设置"
    fi
  fi
  if [ -n "${MODDABLE:-}" ]; then
    log_info "MODDABLE=$MODDABLE"
    [ -d "$MODDABLE" ] && log_success "目录存在" || log_error "目录不存在"
  fi
  if ! command -v mcconfig >/dev/null 2>&1; then
    local cand="${MODDABLE:-}/build/bin/mac/release"
    [ -n "${MODDABLE:-}" ] && [ -d "$cand" ] && export PATH="$cand:$PATH"
  fi
  if command -v mcconfig >/dev/null 2>&1; then
    log_success "mcconfig: $(command -v mcconfig)"
  else
    log_warn "mcconfig 不在 PATH"
  fi
  [ -f "$APP_DIR/main.ts" ] && log_success "app/main.ts 就绪" || log_error "缺少 app"
  local idf="${IDF_PATH:-$HOME/esp32/esp-idf-v6.1}"
  if [ -f "$idf/export.sh" ]; then
    log_success "ESP-IDF: $idf"
  else
    log_warn "ESP-IDF 未就绪: $idf"
  fi
  if [ -d "$HOME/.espressif/tools" ]; then
    log_info "Espressif tools: $(du -sh "$HOME/.espressif" 2>/dev/null | awk '{print $1}')"
    local t
    for t in xtensa-esp-elf riscv32-esp-elf openocd-esp32; do
      if [ -d "$HOME/.espressif/tools/$t" ]; then
        log_success "tool: $t"
      else
        log_warn "缺 tool: $t"
      fi
    done
    if ls -d "$HOME/.espressif/python_env"/idf* >/dev/null 2>&1; then
      log_success "IDF python_env 就绪"
    else
      log_warn "IDF python_env 未就绪"
    fi
  else
    log_warn "Espressif tools 尚未安装（./install.sh esp32s3）"
  fi
}

cmd_ts_sim() {
  need_moddable
  log_info "Moddable 桌面模拟：app（-dn 不弹 xsbug）"
  (cd "$APP_DIR" && mcconfig -d -m -dn -p mac)
}

cmd_ts_flash() {
  need_moddable
  # Prefer brew python@3.12 — system/homebrew python3 may be 3.14 and break IDF venv
  export PATH="/opt/homebrew/opt/python@3.12/libexec/bin:/opt/homebrew/opt/python@3.12/bin:$PATH"
  export IDF_GITHUB_ASSETS="${IDF_GITHUB_ASSETS:-dl.espressif.com/github_assets}"
  # ESP-IDF env required
  if [ -z "${IDF_PATH:-}" ] || [ ! -f "${IDF_PATH}/export.sh" ]; then
    export IDF_PATH="${HOME}/esp32/esp-idf-v6.1"
  fi
  [ -f "$IDF_PATH/export.sh" ] || log_die "缺少 ESP-IDF：${IDF_PATH}（安装未完成）"
  [ -d "$HOME/.espressif/tools/xtensa-esp-elf" ] || log_die "Espressif 工具未装完（缺 xtensa-esp-elf）。等 install 结束后再试"
  [ -d "$HOME/.espressif/tools/riscv32-esp-elf" ] || log_die "Espressif 工具未装完（缺 riscv32-esp-elf）。等 install 结束后再试"
  ls -d "$HOME/.espressif/python_env"/idf* >/dev/null 2>&1 || log_die "IDF python_env 未就绪。等 install-python-env 结束后再试"
  # shellcheck disable=SC1091
  source "$IDF_PATH/export.sh"

  local wifi_args=() line
  while IFS= read -r line; do
    [ -n "$line" ] && wifi_args+=("$line")
  done < <(ts_wifi_args)
  if [ "${#wifi_args[@]}" -eq 0 ]; then
    log_warn "未配置 Wi-Fi：复制 app/wifi.local.json.example → wifi.local.json 后重烧，否则时钟停在 1970"
  else
    log_info "Wi-Fi SSID 已传入 mcconfig（密码不打印）"
  fi

  log_info "Moddable 烧录 esp32/esp32s3_cdc（USB Serial/JTAG，适合 Cardputer）"
  # Flash itself may succeed while xsbug connect fails with -dn; don't treat that as fatal.
  # bash 3.2 + set -u: empty "${arr[@]}" is "unbound variable" — branch instead.
  set +e
  if [ "${#wifi_args[@]}" -gt 0 ]; then
    (cd "$APP_DIR" && mcconfig -d -m -dn -p esp32/esp32s3_cdc "${wifi_args[@]}")
  else
    (cd "$APP_DIR" && mcconfig -d -m -dn -p esp32/esp32s3_cdc)
  fi
  local rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    # ${rc}: bash 3.2 treats $rc（ as a multi-byte var name
    log_warn "mcconfig 退出码 ${rc}（若已 Hash verified / Done，多半是 xsbug 未连上，可忽略）"
  fi
  log_success "烧录流程结束；板子按 RESET。要对时需 wifi.local.json 或 WIFI_SSID/WIFI_PASSWORD"
}

run() {
  local cmd="$1"
  shift || true
  case "$cmd" in
    ts-check | check) cmd_ts_check ;;
    ts-sim | sim) cmd_ts_sim ;;
    ts-flash | flash) cmd_ts_flash ;;
    gen-font | font) cmd_gen_font "$@" ;;
    port) cmd_port ;;
    clean) cmd_clean ;;
    -h | --help | help) usage ;;
    *)
      log_error "未知命令：$cmd"
      usage 1
      ;;
  esac
}

main_menu() {
  local choice
  while true; do
    choice="$(prompt_menu "cadv" --default=1 \
      "ts-flash:烧录到 ESP32-S3" \
      "ts-sim:桌面模拟" \
      "ts-check:检查 Moddable / TS 环境" \
      "gen-font:生成 UI BMFont" \
      "port:列出串口" \
      "clean:清理临时日志" \
      "help:命令说明" \
      "quit:退出")"
    case "$choice" in
      quit) return 0 ;;
    esac
    # 子命令失败不退出菜单
    # shellcheck disable=SC2086
    (run $choice) || log_error "执行失败（${choice}）"
    pause_menu
  done
}

if [ $# -eq 0 ]; then
  if [ -t 0 ]; then
    main_menu
  else
    usage
  fi
else
  run "$@"
fi

#!/usr/bin/env bash
# cadv 常用命令入口。无参数进入交互菜单。
#
# 固件（Arduino CLI → Cardputer / Cardputer-Adv）:
#   ./do.sh build                   # 编译固件
#   ./do.sh flash [端口]            # 编译并烧录（可省略端口，自动找 cu.usbmodem*）
#   ./do.sh upload [端口]           # 只烧录（不重新编译）
#   ./do.sh monitor [端口]          # 串口监视 115200
#   ./do.sh port                    # 列出可用串口
#
# 本机模拟（SDL，240×135，不烧录）:
#   ./do.sh sim                     # 构建（如需）并启动模拟器
#   ./do.sh sim-build               # 只构建模拟器
#   ./do.sh sim-stop                # 关掉正在跑的模拟器
#
# 其它:
#   ./do.sh clean                   # 清 .pio / 本地日志
#   ./do.sh help                    # 本说明
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

FQBN='m5stack:esp32:m5stack_cardputer'
SKETCH="$ROOT/firmware_arduino/CardputerClock"
LIBS="${HOME}/Documents/Arduino/libraries"
SIM_ENV='native_cardputer_adv'
SIM_PROG="$ROOT/sim/.pio/build/${SIM_ENV}/program"

# PATH：Homebrew arduino-cli + user pio
export PATH="/opt/homebrew/bin:${HOME}/Library/Python/3.9/bin:${PATH}"
export HOMEBREW_PREFIX="${HOMEBREW_PREFIX:-/opt/homebrew}"

# ---------- log ----------
if [ -t 1 ] || [ -t 2 ]; then
  _R=$'\033[0m' _D=$'\033[2m' _I=$'\033[36m' _O=$'\033[32m' _W=$'\033[33m' _E=$'\033[31m'
else
  _R='' _D='' _I='' _O='' _W='' _E=''
fi
log_info()    { printf '%sℹ%s %scadv%s  %s\n' "$_I" "$_R" "$_D" "$_R" "$*"; }
log_success() { printf '%s✓%s %scadv%s  %s\n' "$_O" "$_R" "$_D" "$_R" "$*"; }
log_warn()    { printf '%s⚠%s %scadv%s  %s\n' "$_W" "$_R" "$_D" "$_R" "$*" >&2; }
log_error()   { printf '%s✗%s %scadv%s  %s\n' "$_E" "$_R" "$_D" "$_R" "$*" >&2; }
log_die()     { log_error "$*"; exit 1; }

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
  local ports=()
  # bash 3.2-safe：不依赖 mapfile
  local p
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

require_port() {
  local port="${1:-}"
  if [ -z "$port" ]; then
    port="$(detect_port)" || log_die "未找到串口。电源 OFF → 按住 G0 → 插 USB → 松开后重试"
  fi
  [ -e "$port" ] || log_die "串口不存在：$port"
  printf '%s\n' "$port"
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

cmd_build() {
  need_cmd arduino-cli
  [ -d "$SKETCH" ] || log_die "找不到 sketch：$SKETCH"
  log_info "编译 $SKETCH"
  arduino-cli compile --fqbn "$FQBN" --libraries "$LIBS" "$SKETCH"
  log_success "编译完成"
}

cmd_upload() {
  need_cmd arduino-cli
  local port
  port="$(require_port "${1:-}")"
  log_info "烧录 → $port"
  arduino-cli upload -p "$port" --fqbn "$FQBN" "$SKETCH"
  log_success "烧录完成；电源拨到 ON"
}

cmd_flash() {
  cmd_build
  cmd_upload "${1:-}"
}

cmd_monitor() {
  need_cmd arduino-cli
  local port
  port="$(require_port "${1:-}")"
  log_info "监视 $port @ 115200（Ctrl-C 退出）"
  arduino-cli monitor -p "$port" -c baudrate=115200
}

cmd_sim_build() {
  need_cmd pio
  log_info "构建 SDL 模拟器"
  (cd "$ROOT/sim" && pio run -e "$SIM_ENV")
  log_success "模拟器已构建：$SIM_PROG"
}

cmd_sim_stop() {
  if pkill -f 'native_cardputer_adv/program' 2>/dev/null; then
    log_success "已停止模拟器"
  else
    log_info "没有在跑的模拟器"
  fi
}

cmd_sim() {
  need_cmd pio
  if [ ! -x "$SIM_PROG" ]; then
    cmd_sim_build
  fi
  cmd_sim_stop >/dev/null 2>&1 || true
  log_info "启动模拟器（Dock 里找窗口；L/R 旋转）"
  "$SIM_PROG" >/tmp/cadv-sim.log 2>&1 &
  disown || true
  sleep 0.4
  if pgrep -f 'native_cardputer_adv/program' >/dev/null; then
    log_success "模拟器已启动"
  else
    log_die "启动失败，见 /tmp/cadv-sim.log"
  fi
}

cmd_clean() {
  rm -rf "$ROOT/sim/.pio" "$ROOT/firmware/.pio"
  rm -f /tmp/cadv-sim.log /tmp/sim_*.log /tmp/cardputer_*.log /tmp/clock_*.log 2>/dev/null || true
  log_success "已清理 .pio 与临时日志"
}

run() {
  local cmd="$1"
  shift || true
  case "$cmd" in
    build) cmd_build ;;
    flash) cmd_flash "$@" ;;
    upload) cmd_upload "$@" ;;
    monitor) cmd_monitor "$@" ;;
    port) cmd_port ;;
    sim) cmd_sim ;;
    sim-build) cmd_sim_build ;;
    sim-stop) cmd_sim_stop ;;
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
    echo ""
    echo "cadv"
    echo "  1) flash      编译并烧录"
    echo "  2) build      只编译"
    echo "  3) upload     只烧录"
    echo "  4) monitor    串口监视"
    echo "  5) sim        启动 SDL 模拟器"
    echo "  6) sim-build  构建模拟器"
    echo "  7) port       列出串口"
    echo "  8) clean      清理构建"
    echo "  9) help       说明"
    echo "  0) quit       退出"
    echo ""
    read -r -p "选择 [1]: " choice </dev/tty || true
    choice="${choice:-1}"
    case "$choice" in
      0 | q | quit) return 0 ;;
      1) choice=flash ;;
      2) choice=build ;;
      3) choice=upload ;;
      4) choice=monitor ;;
      5) choice=sim ;;
      6) choice=sim-build ;;
      7) choice=port ;;
      8) choice=clean ;;
      9 | h | help) choice=help ;;
      *)
        log_error "无效选项：$choice"
        pause_menu
        continue
        ;;
    esac
    (run "$choice") || log_error "执行失败（${choice}）"
    [ "$choice" = help ] || pause_menu
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

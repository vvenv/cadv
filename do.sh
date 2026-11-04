#!/usr/bin/env bash
# cadv 常用命令入口。无参数进入交互菜单；具体做法仍在本脚本命令函数里，这里做转发。
#
# 固件（Arduino CLI → Cardputer / Cardputer-Adv）:
#   ./do.sh build                   # 编译固件
#   ./do.sh flash [端口]            # 编译并烧录（可省略端口，自动找 cu.usbmodem*）
#   ./do.sh upload [端口]           # 只烧录（不重新编译）
#   ./do.sh monitor [端口]          # 串口监视 115200
#   ./do.sh port                    # 列出可用串口
#
# 本机模拟（SDL 跑 firmware/src，不烧录）:
#   ./do.sh sim                     # 构建（如需）并启动模拟器
#   ./do.sh sim-build               # 只构建模拟器
#   ./do.sh sim-stop                # 关掉正在跑的模拟器
#
# TypeScript / Moddable（板端 Hello，需先装 Moddable SDK）:
#   ./do.sh ts-sim                  # 桌面模拟器跑 ts-hello
#   ./do.sh ts-flash                # 烧到 esp32/esp32s3（USB；Wi-Fi 见 ts-hello/wifi.local.json）
#   ./do.sh ts-check                # 检查 MODDABLE / mcconfig
#
# 其它:
#   ./do.sh ide                     # 生成 compile_commands.json（Cmd+悬停 hint）
#   ./do.sh clean                   # 清 .pio / 本地日志
#   ./do.sh help                    # 本说明
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

LOG_TAG=cadv
# shellcheck source=scripts/lib/log.sh
source "$ROOT/scripts/lib/log.sh"
# shellcheck source=scripts/lib/prompt-menu.sh
source "$ROOT/scripts/lib/prompt-menu.sh"

FQBN='m5stack:esp32:m5stack_cardputer'
SKETCH="$ROOT/firmware_arduino/CardputerClock"
LIBS="${HOME}/Documents/Arduino/libraries"
SIM_ENV='native_cardputer_adv'
SIM_PROG="$ROOT/sim/.pio/build/${SIM_ENV}/program"

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
  log_info "编译固件（不含 SDL 模拟器）$SKETCH"
  arduino-cli compile --fqbn "$FQBN" --libraries "$LIBS" "$SKETCH"
  log_success "固件编译完成"
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
  # ini / firmware / host stubs 变更不会总被 pio 感知，按时间戳强制重建
  local need_build=0
  if [ ! -x "$SIM_PROG" ]; then
    need_build=1
  else
    local f
    for f in \
      "$ROOT/sim/platformio.ini" \
      "$ROOT/firmware/src/main.cpp" \
      "$ROOT/firmware/include/config.h" \
      "$ROOT/sim/src/sdl_main.cpp" \
      "$ROOT/sim/lib/cadv_host/include/Arduino.h" \
      "$ROOT/sim/lib/cadv_host/include/M5Cardputer.h" \
      "$ROOT/sim/lib/cadv_host/include/WiFi.h" \
      "$ROOT/sim/lib/cadv_host/include/Preferences.h" \
      "$ROOT/sim/lib/cadv_host/src/M5Cardputer.cpp" \
      "$ROOT/sim/lib/cadv_host/src/Preferences.cpp"
    do
      if [ -e "$f" ] && [ "$f" -nt "$SIM_PROG" ]; then
        need_build=1
        break
      fi
    done
  fi
  if [ "$need_build" -eq 1 ]; then
    cmd_sim_build
  fi

  # 首次启动预置假 Wi-Fi，跳过配网；W 可重配。Wi-Fi/NTP 在主机上是 stub。
  local prefs=/tmp/cadv-sim-clock.prefs
  if [ ! -f "$prefs" ]; then
    printf 'ssid=sim\npass=sim\n' >"$prefs"
  fi

  cmd_sim_stop >/dev/null 2>&1 || true
  log_info "启动模拟器（跑 firmware/src；Dock 找窗口；Ctrl+L/R 旋转；R 重校时 W 重配 Wi-Fi）"
  "$SIM_PROG" >/tmp/cadv-sim.log 2>&1 &
  disown || true
  sleep 0.4
  if pgrep -f 'native_cardputer_adv/program' >/dev/null; then
    log_success "模拟器已启动"
  else
    log_die "启动失败，见 /tmp/cadv-sim.log"
  fi
}

cmd_ide() {
  need_cmd pio
  need_cmd python3
  log_info "生成 compile_commands.json，供编辑器 Cmd+悬停"
  (cd "$ROOT/sim" && pio run -e "$SIM_ENV" -t compiledb)
  ROOT="$ROOT" python3 - <<'PY'
import json, os
from pathlib import Path

root = Path(os.environ["ROOT"])
db = json.loads((root / "sim" / "compile_commands.json").read_text())
entry = next(
    e
    for e in db
    if str(e.get("file", "")).endswith("src/main.cpp") and "sdl_main" not in str(e.get("file", ""))
)
src = (root / "firmware" / "src" / "main.cpp").resolve()
suffix = " src/main.cpp"
cmd = entry["command"]
if not cmd.endswith(suffix):
    raise SystemExit("compile command does not end with src/main.cpp")
cmd = cmd[: -len(suffix)] + " " + str(src)
out = [{"directory": entry["directory"], "file": str(src), "command": cmd}]
(root / "compile_commands.json").write_text(json.dumps(out, indent=2) + "\n")
print(src)
PY
  log_success "已写入 $ROOT/compile_commands.json（装 clangd 扩展后重载窗口）"
}

cmd_clean() {
  rm -rf "$ROOT/sim/.pio" "$ROOT/firmware/.pio"
  rm -f /tmp/cadv-sim.log /tmp/sim_*.log /tmp/cardputer_*.log /tmp/clock_*.log 2>/dev/null || true
  log_success "已清理 .pio 与临时日志"
}

# ---------- Moddable / TypeScript ----------

need_moddable() {
  if [ -z "${MODDABLE:-}" ] || [ ! -d "${MODDABLE:-}" ]; then
    if [ -d "$ROOT/third_party/moddable" ]; then
      export MODDABLE="$ROOT/third_party/moddable"
    else
      log_die "未设置 MODDABLE。先按 ts-hello/README.md 安装 Moddable SDK，并 export MODDABLE=..."
    fi
  fi
  # ensure mcconfig on PATH (common mac layout)
  if ! command -v mcconfig >/dev/null 2>&1; then
    local cand="$MODDABLE/build/bin/mac/release"
    [ -d "$cand" ] && export PATH="$cand:$PATH"
  fi
  command -v mcconfig >/dev/null 2>&1 || log_die "找不到 mcconfig（MODDABLE=$MODDABLE）"
}

# Prints ssid=… / password=… lines for mcconfig from env or wifi.local.json.
ts_wifi_args() {
  local ssid="${WIFI_SSID:-}" password="${WIFI_PASSWORD:-}" file="$ROOT/ts-hello/wifi.local.json"
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
  [ -f "$ROOT/ts-hello/main.ts" ] && log_success "ts-hello/main.ts 就绪" || log_error "缺少 ts-hello"
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
  log_info "Moddable 桌面模拟：ts-hello（-dn 不弹 xsbug）"
  (cd "$ROOT/ts-hello" && mcconfig -d -m -dn -p mac)
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
  [ -f "$IDF_PATH/export.sh" ] || log_die "缺少 ESP-IDF：$IDF_PATH（安装未完成）"
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
    log_warn "未配置 Wi-Fi：复制 ts-hello/wifi.local.json.example → wifi.local.json 后重烧，否则时钟停在 1970"
  else
    log_info "Wi-Fi SSID 已传入 mcconfig（密码不打印）"
  fi

  log_info "Moddable 烧录 esp32/esp32s3_cdc（USB Serial/JTAG，适合 Cardputer）"
  # Flash itself may succeed while xsbug connect fails with -dn; don't treat that as fatal.
  set +e
  (cd "$ROOT/ts-hello" && mcconfig -d -m -dn -p esp32/esp32s3_cdc "${wifi_args[@]}")
  local rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    log_warn "mcconfig 退出码 $rc（若已 Hash verified / Done，多半是 xsbug 未连上，可忽略）"
  fi
  log_success "烧录流程结束；板子按 RESET。要对时需 wifi.local.json 或 WIFI_SSID/WIFI_PASSWORD"
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
    ts-check) cmd_ts_check ;;
    ts-sim) cmd_ts_sim ;;
    ts-flash) cmd_ts_flash ;;
    ide) cmd_ide ;;
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
      "flash:编译并烧录固件" \
      "build:只编译固件（不含模拟器）" \
      "upload:只烧录固件" \
      "monitor:监视串口" \
      "sim:启动模拟器（ini 变更会自动重建）" \
      "more:更多…" \
      "quit:退出")"
    case "$choice" in
      quit) return 0 ;;
      more)
        choice="$(prompt_menu "更多" --default=1 \
          "back:返回" \
          "sim-build:只构建模拟器（pio）" \
          "sim-stop:停止模拟器" \
          "ts-check:检查 Moddable / TS 环境" \
          "ts-sim:TS Hello 桌面模拟" \
          "ts-flash:TS Hello 烧 ESP32-S3" \
          "port:列出串口" \
          "ide:生成 Cmd+悬停用的编译数据库" \
          "clean:清理 .pio / 临时日志" \
          "help:命令说明")"
        case "$choice" in
          back) continue ;;
        esac
        ;;
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

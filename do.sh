#!/usr/bin/env bash
# cadv 常用命令入口。无参数进入交互菜单；具体做法仍在本脚本命令函数里，这里做转发。
#
# 固件在 fw/<id>/（manifest.json + 一行 label）。do.sh 按目录发现，不写死名单。
#   ./do.sh                         # 交互菜单。烧录直接烧启动器；模拟会再选固件
#   ./do.sh flash                   # 把启动器烧进芯片。其它固件放 SD 卡，在设备上选
#   ./do.sh flash <id>              # 仍可把某一个直接烧进芯片，会盖掉启动器
#   ./do.sh sim clock               # 桌面模拟某一个固件
#   fw/<id>/sample 存在时，模拟把文件根指到该目录。
#   菜单里 Esc、← 或 BS 返回上一级。主菜单再按一次即退出。
#   模拟不写 id、或上传「一个固件」时，会列出 fw/*/label。取消则什么都不做。
#   字体比源文件旧时会先问要不要生成。选中的固件用到 wordbank.bin 时才重做词库。
#   CADV_REFRESH=1 直接生成；CADV_REFRESH=0 跳过。
#   ./do.sh ts-check                # 检查 MODDABLE / mcconfig
#   ./do.sh port                    # 列出可用串口
#   ./do.sh gen-font                # 用 fontbm 生成 shared/fonts/UI-Bold-20（思源 Bold）
#   ./do.sh gen-words               # 从 ../alice/data 生成 fw/words/wordbank.bin
#   ./do.sh clean                   # 清临时日志
#   ./do.sh sd                      # 列出卡上的 cadv/
#   ./do.sh sd fw                  # 把除启动器以外的全部固件拷进 cadv/（不烧进芯片）
#   ./do.sh sd fw clock             # 只拷一个：cadv/clock.bin 和一行名字
#   ./do.sh sd file ./a.txt         # 把文件或目录拷进 cadv/
#   卡插在电脑上时直接写卡。没插卡、板子用 USB 连着并且跑着启动器时，经串口写入板子上的卡。
#   CADV_SD=/Volumes/名字 指定卡。CADV_PORT=/dev/cu.usbmodemXXX 指定串口。
#   CADV_LINK=device 强制走板子；CADV_LINK=0 只认插在电脑上的卡。
#   CADV_SD_BUILD=1 先重编再拷。启动器要先 ./do.sh flash，这一版才从 USB 收文件。
#   ./do.sh help                    # 本说明
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

LOG_TAG=cadv
# shellcheck source=scripts/lib/log.sh
source "$ROOT/scripts/lib/log.sh"
# shellcheck source=scripts/lib/prompt-menu.sh
source "$ROOT/scripts/lib/prompt-menu.sh"

FW_ROOT="$ROOT/fw"

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

# fw/<id>/manifest.json is one firmware. label is the one-line menu name.
fw_ids() {
  local d
  [ -d "$FW_ROOT" ] || return 0
  for d in "$FW_ROOT"/*; do
    [ -f "$d/manifest.json" ] || continue
    basename "$d"
  done
}

fw_label() {
  local id="$1" f="$FW_ROOT/$1/label" line=""
  if [ -f "$f" ]; then
    IFS= read -r line <"$f" || true
  fi
  if [ -n "$line" ]; then
    printf '%s\n' "$line"
  else
    printf '%s\n' "$id"
  fi
}

fw_exists() {
  [ -n "${1:-}" ] && [ -f "$FW_ROOT/$1/manifest.json" ]
}

pick_fw() {
  local title="$1" id opts=()
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    opts+=("$id:$(fw_label "$id")")
  done < <(fw_ids)
  [ "${#opts[@]}" -gt 0 ] || log_die "fw/ 下没有固件。新增：建 fw/<id>/，放入 manifest.json 和一行 label"
  prompt_menu "$title" --back "${opts[@]}"
}

require_fw() {
  local id="${1:-}"
  if [ -z "$id" ]; then
    if [ -t 0 ]; then
      id="$(pick_fw "选择固件")"
      # Esc / ← / BS：调用方什么都不做。空串且返回 0，和 log_die 的退出区分开。
      [ -n "$id" ] || return 0
    else
      log_die "要指定固件 id：$(fw_ids | tr '\n' ' ')"
    fi
  fi
  fw_exists "$id" || log_die "没有固件：$id（可选：$(fw_ids | tr '\n' ' ')）"
  printf '%s\n' "$id"
}

# A firmware that embeds wordbank.bin needs the generated bank refreshed.
fw_uses_wordbank() {
  grep -q 'wordbank\.bin' "$FW_ROOT/$1/manifest.json"
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

cmd_gen_words() {
  node "$ROOT/scripts/gen-wordbank.mjs"
}

# fw/words/wordbank.bin is older than the generator, the elementary lists,
# or the gloss and phonetic sources.
wordbank_stale() {
  local out="$FW_ROOT/words/wordbank.bin"
  local alice="$ROOT/../alice"
  local hit meta csv
  [ -f "$out" ] || return 0
  [ "$ROOT/scripts/gen-wordbank.mjs" -nt "$out" ] && return 0
  for meta in "$alice/assets/data/library.json" "$alice/assets/data/ecdict-meta.json"; do
    [ -f "$meta" ] && [ "$meta" -nt "$out" ] && return 0
  done
  for csv in "$ROOT/.cache/ecdict.csv" "$alice/.cache/ecdict.csv"; do
    [ -f "$csv" ] && [ "$csv" -nt "$out" ] && return 0
  done
  if [ -d "$alice/data" ]; then
    hit="$(find "$alice/data" -path '*小学*/*.txt' -newer "$out" -print -quit)"
    [ -n "$hit" ] && return 0
  fi
  return 1
}

font_stale() {
  if "$ROOT/scripts/gen-ui-font.sh" --stale; then
    return 1
  fi
  return 0
}

# Offer to rebuild a stale word bank (only if this firmware embeds one), then the shared font.
# CADV_REFRESH=1 runs it; CADV_REFRESH=0 skips; otherwise ask on a terminal.
refresh_generated() {
  local want_words="${1:-0}"
  local words=0 fonts=0 msg ans
  if [ "$want_words" -eq 1 ] && wordbank_stale; then
    words=1
  fi
  if font_stale; then
    fonts=1
  fi
  if [ "$words" -eq 0 ] && [ "$fonts" -eq 0 ]; then
    return 0
  fi
  if [ "$words" -eq 1 ]; then
    msg="词库比词表或释义旧，会重做词库和字体"
  else
    msg="字体比界面文案或词库旧"
  fi

  case "${CADV_REFRESH:-ask}" in
    1) ;;
    0)
      log_warn "${msg}。已跳过（CADV_REFRESH=0）"
      return 0
      ;;
    *)
      if [ -t 0 ] || [ -t 1 ]; then
        read -r -p "${msg}。现在生成？ [Y/n] " ans </dev/tty || ans=n
        case "${ans:-Y}" in
          n|N|no|NO|否)
            log_warn "已跳过，继续用现有词库和字体"
            return 0
            ;;
        esac
      else
        log_warn "${msg}。非交互已跳过；CADV_REFRESH=1 可自动生成"
        return 0
      fi
      ;;
  esac

  if [ "$words" -eq 1 ]; then
    cmd_gen_words
  fi
  if font_stale; then
    cmd_gen_font
  fi
}

# ---------- SD card ----------

human_bytes() {
  local n="$1" tenths
  if [ "$n" -lt 1024 ]; then
    printf '%sB\n' "$n"
  elif [ "$n" -lt $((1024 * 1024)) ]; then
    printf '%sK\n' $(((n + 512) / 1024))
  else
    tenths=$(((n * 10 + 524288) / 1048576))
    printf '%s.%sM\n' $((tenths / 10)) $((tenths % 10))
  fi
}

diskutil_field() {
  local info="$1" label="$2"
  printf '%s\n' "$info" | sed -n "s/^.*${label}:[[:space:]]*//p" | head -1
}

# External FAT/exFAT volumes. One path per line. Skips the system disk.
sd_candidates() {
  local v info fs where mount
  for v in /Volumes/*; do
    [ -d "$v" ] || continue
    [ -L "$v" ] && continue
    info="$(diskutil info "$v" 2>/dev/null)" || continue
    fs="$(diskutil_field "$info" "File System Personality" | tr '[:upper:]' '[:lower:]')"
    case "$fs" in
      *fat* | *dos*) ;;
      *) continue ;;
    esac
    where="$(diskutil_field "$info" "Device Location")"
    case "$where" in
      Internal) continue ;;
    esac
    mount="$(diskutil_field "$info" "Mount Point")"
    [ -n "$mount" ] && [ "$mount" != "/" ] || continue
    [ -d "$mount" ] || continue
    printf '%s\n' "$mount"
  done
}

# Prints the card root. Empty stdout and 0 means the user cancelled.
# CADV_SD overrides detection (also used to point at a directory in tests).
sd_root() {
  local root vols=() v opts=() pick
  if [ -n "${CADV_SD:-}" ]; then
    root="$(cd "$CADV_SD" 2>/dev/null && pwd)" || log_die "CADV_SD 不是目录：$CADV_SD"
    case "$root" in
      / | "$HOME" | "$ROOT") log_die "CADV_SD 不能是 $root" ;;
    esac
    printf '%s\n' "$root"
    return 0
  fi
  while IFS= read -r v; do
    [ -n "$v" ] || continue
    vols+=("$v")
  done < <(sd_candidates)
  case "${#vols[@]}" in
    0)
      return 2
      ;;
    1)
      printf '%s\n' "${vols[0]}"
      ;;
    *)
      if [ ! -t 0 ]; then
        log_die "多张卡：${vols[*]}。指定 CADV_SD=…"
      fi
      for v in "${vols[@]}"; do
        opts+=("$v:$v")
      done
      pick="$(prompt_menu "哪张 SD 卡" --back "${opts[@]}")"
      [ -n "$pick" ] || return 0
      printf '%s\n' "$pick"
      ;;
  esac
}

# volume<TAB>path, or device<TAB>port. Empty stdout and 0 means the user cancelled.
# sd_root status 2 means no FAT volume was found.
sd_route() {
  local root="" rc=0 port
  if [ "${CADV_LINK:-}" = "device" ] && [ -z "${CADV_SD:-}" ]; then
    rc=2
  else
    root="$(sd_root)" && rc=0 || rc=$?
  fi
  if [ "$rc" -eq 0 ]; then
    if [ -n "$root" ]; then
      [ -w "$root" ] || log_die "SD 卡只读：$root"
      printf 'volume\t%s\n' "$root"
    fi
    return 0
  fi
  if [ "$rc" -ne 2 ]; then
    return "$rc"
  fi
  if [ "${CADV_LINK:-}" = "0" ]; then
    log_die "没有挂上 FAT/exFAT 的 SD 卡。把卡插到电脑，或 CADV_SD=/Volumes/名字"
  fi
  port="$(link_port)" || return $?
  printf 'device\t%s\n' "$port"
}

link_python() {
  if python3 -c 'import serial' >/dev/null 2>&1; then
    command -v python3
    return 0
  fi
  local env
  env="$(ls -d "$HOME/.espressif/python_env"/idf*/bin/python 2>/dev/null | tail -1 || true)"
  if [ -n "$env" ] && "$env" -c 'import serial' >/dev/null 2>&1; then
    printf '%s\n' "$env"
    return 0
  fi
  log_die "没有 pyserial。ESP-IDF 的 Python 环境里有，或 pip install pyserial"
}

link_port() {
  local port
  if [ -n "${CADV_PORT:-}" ]; then
    [ -e "$CADV_PORT" ] || log_die "CADV_PORT 不是串口：$CADV_PORT"
    printf '%s\n' "$CADV_PORT"
    return 0
  fi
  port="$(detect_port)" || log_die "没有 FAT/exFAT 的卡，也没找到板子的串口。把卡插到电脑，或用 USB 连上板子（先 ./do.sh flash 启动器）。"
  printf '%s\n' "$port"
}

link_ping() {
  local py
  py="$(link_python)"
  "$py" "$ROOT/scripts/sd_link.py" ping "$1"
}

link_ls() {
  local py
  py="$(link_python)"
  "$py" "$ROOT/scripts/sd_link.py" ls "$1"
}

link_put() {
  local py port
  py="$(link_python)"
  port="$1"
  shift
  "$py" "$ROOT/scripts/sd_link.py" put "$port" "$@"
}

# The device only opens this directory. The rest of a large card is ignored.
SD_DIR=cadv

fw_image() {
  need_moddable
  printf '%s\n' "$MODDABLE/build/bin/esp32/esp32s3_cdc/debug/$1/xs_esp32.bin"
}

cmd_sd_ls_device() {
  local port="$1" rel="${2:-.}" out size name shown=0
  case "$rel" in
    /* | .. | ../* | */.. | */../*) log_die "只列出 ${SD_DIR} 里的相对路径" ;;
  esac
  log_info "设备上的 ${SD_DIR}/（${port}）"
  out="$(link_ls "$port")" || return $?
  while IFS=$'\t' read -r size name; do
    [ -n "${name:-}" ] || continue
    if [ "$rel" != "." ]; then
      case "$name" in
        "$rel" | "$rel"/*) ;;
        *) continue ;;
      esac
    fi
    shown=1
    printf '%s\t%s\n' "$name" "$(human_bytes "$size")"
  done <<< "$out"
  [ "$shown" -eq 1 ] || log_info "${SD_DIR} 是空的"
}

cmd_sd_ls() {
  local route kind root dir rel found=0 f base bytes
  route="$(sd_route)" || return $?
  [ -n "$route" ] || return 0
  kind="${route%%$'\t'*}"
  root="${route#*$'\t'}"
  if [ "$kind" = "device" ]; then
    cmd_sd_ls_device "$root" "$@"
    return 0
  fi
  dir="$root/$SD_DIR"
  rel="${1:-.}"
  case "$rel" in
    /* | .. | ../* | */.. | */../*) log_die "只列出 ${SD_DIR} 里的相对路径" ;;
  esac
  if [ "$rel" != "." ]; then
    dir="$dir/$rel"
  fi
  log_info "SD 卡 $root/$SD_DIR"
  if [ ! -d "$dir" ]; then
    log_info "还没有 ${SD_DIR}。上传固件或文件时会创建。"
    return 0
  fi
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    found=1
    base="${f#"$dir"/}"
    if [ -d "$f" ]; then
      printf '%s/\n' "$base"
    else
      bytes="$(wc -c <"$f" | tr -d ' ')"
      printf '%s\t%s\n' "$base" "$(human_bytes "$bytes")"
    fi
  done < <(find "$dir" -mindepth 1 -maxdepth 2 \( -type f -o -type d \) ! -name '.*' ! -name '.DS_Store' | sort)
  [ "$found" -eq 1 ] || log_info "${SD_DIR} 是空的"
}

cmd_sd_file_device() {
  local port="$1" src name f rel srcs=() dsts=() args=() i
  shift
  for src in "$@"; do
    src="${src#\"}"
    src="${src%\"}"
    src="${src#\'}"
    src="${src%\'}"
    src="${src/#\~/$HOME}"
    [ -e "$src" ] || log_die "没有这个路径：$src"
    src="$(cd "$(dirname "$src")" && pwd)/$(basename "$src")"
    name="$(basename "$src")"
    case "$name" in
      "" | . | ..) log_die "路径不对：$src" ;;
    esac
    if [ -d "$src" ]; then
      while IFS= read -r f; do
        [ -n "$f" ] || continue
        rel="${f#"$src"/}"
        case "$rel" in
          .* | */.*) continue ;;
        esac
        srcs+=("$f")
        dsts+=("${name}/${rel}")
      done < <(find "$src" -type f ! -name '.DS_Store' | sort)
    else
      srcs+=("$src")
      dsts+=("$name")
    fi
  done
  [ "${#srcs[@]}" -gt 0 ] || log_die "没有可上传的文件"
  for i in "${!srcs[@]}"; do
    args+=("${srcs[$i]}" "${dsts[$i]}")
  done
  log_info "经 USB 写入 ${SD_DIR}/（${port}）"
  link_put "$port" "${args[@]}"
  log_success "已写入 ${#srcs[@]} 个文件"
}

cmd_sd_file() {
  local route kind root src name dest
  if [ $# -eq 0 ]; then
    if [ -t 0 ]; then
      read -r -p "要拷到 SD 卡的文件或目录: " src </dev/tty || true
      [ -n "$src" ] || return 0
      set -- "$src"
    else
      log_die "用法：./do.sh sd file <文件或目录>…"
    fi
  fi
  route="$(sd_route)" || return $?
  [ -n "$route" ] || return 0
  kind="${route%%$'\t'*}"
  root="${route#*$'\t'}"
  if [ "$kind" = "device" ]; then
    cmd_sd_file_device "$root" "$@"
    return 0
  fi
  mkdir -p "$root/$SD_DIR"
  for src in "$@"; do
    src="${src#\"}"
    src="${src%\"}"
    src="${src#\'}"
    src="${src%\'}"
    src="${src/#\~/$HOME}"
    [ -e "$src" ] || log_die "没有这个路径：$src"
    src="$(cd "$(dirname "$src")" && pwd)/$(basename "$src")"
    case "$src" in
      "$root" | "$root"/*) log_die "源路径已经在这张卡上：$src" ;;
    esac
    name="$(basename "$src")"
    case "$name" in
      "" | . | ..) log_die "路径不对：$src" ;;
    esac
    dest="$root/$SD_DIR/$name"
    if [ -d "$src" ]; then
      mkdir -p "$dest"
      cp -R -X "$src/." "$dest/"
      log_success "已写入 ${name}/"
    else
      cp -X -f "$src" "$dest"
      log_success "已写入 ${name}（$(human_bytes "$(wc -c <"$dest" | tr -d ' ')")）"
    fi
  done
  sync || true
}

ensure_fw_image() {
  local id="$1" src
  src="$(fw_image "$id")"
  if [ ! -f "$src" ] || [ "${CADV_SD_BUILD:-0}" = 1 ]; then
    if [ -f "$src" ]; then
      log_info "重编 $(fw_label "$id")（不烧进芯片）"
    else
      log_info "还没有 $(fw_label "$id") 的镜像，先编译（不烧进芯片）"
    fi
    build_fw_image "$id"
  else
    log_info "用已有镜像 $(date -r "$src" '+%Y-%m-%d %H:%M')。重编：CADV_SD_BUILD=1 ./do.sh sd fw $id"
  fi
  src="$(fw_image "$id")"
  [ -f "$src" ] || log_die "编译后仍没有镜像：$src"
}

cmd_sd_fw_device() {
  local port="$1" id src tmp rc=0 args=() tmps=()
  shift
  log_info "经 USB 写入卡上的 ${SD_DIR}/（${port}）"
  link_ping "$port"
  for id in "$@"; do
    ensure_fw_image "$id"
  done
  for id in "$@"; do
    src="$(fw_image "$id")"
    tmp="$(mktemp "${TMPDIR:-/tmp}/cadv-label.XXXXXX")"
    printf '%s\n' "$(fw_label "$id")" >"$tmp"
    tmps+=("$tmp")
    args+=("$src" "${id}.bin" "$tmp" "${id}.txt")
  done
  link_put "$port" "${args[@]}" || rc=$?
  rm -f "${tmps[@]}"
  [ "$rc" -eq 0 ] || return "$rc"
  for id in "$@"; do
    src="$(fw_image "$id")"
    log_success "$(fw_label "$id") → ${SD_DIR}/${id}.bin（$(human_bytes "$(wc -c <"$src" | tr -d ' ')")）"
  done
}

cmd_sd_fw() {
  local route kind root id src dest home ids=()
  if [ $# -eq 0 ] || [ "${1:-}" = "all" ]; then
    while IFS= read -r id; do
      [ -n "$id" ] || continue
      [ "$id" = "sd" ] && continue
      ids+=("$id")
    done < <(fw_ids)
  else
    for id in "$@"; do
      if [ "$id" = "sd" ]; then
        log_warn "跳过启动器 sd，它留在芯片里"
        continue
      fi
      fw_exists "$id" || log_die "没有固件：$id（可选：$(fw_ids | tr '\n' ' ')）"
      ids+=("$id")
    done
  fi
  [ "${#ids[@]}" -gt 0 ] || log_die "没有可上传的固件"
  route="$(sd_route)" || return $?
  [ -n "$route" ] || return 0
  kind="${route%%$'\t'*}"
  root="${route#*$'\t'}"
  if [ "$kind" = "device" ]; then
    cmd_sd_fw_device "$root" "${ids[@]}"
    return 0
  fi
  home="$root/$SD_DIR"
  mkdir -p "$home"
  for id in "${ids[@]}"; do
    ensure_fw_image "$id"
    src="$(fw_image "$id")"
    dest="$home/${id}.bin"
    cp -X -f "$src" "$dest"
    printf '%s\n' "$(fw_label "$id")" > "$home/${id}.txt"
    log_success "$(fw_label "$id") → ${SD_DIR}/${id}.bin（$(human_bytes "$(wc -c <"$dest" | tr -d ' ')")）"
  done
  sync || true
}

cmd_sd() {
  local sub="${1:-}"
  case "$sub" in
    "" | ls | list)
      [ -n "$sub" ] && shift
      cmd_sd_ls "$@"
      ;;
    fw | firmware)
      shift
      cmd_sd_fw "$@"
      ;;
    file | files)
      shift
      cmd_sd_file "$@"
      ;;
    *)
      log_die "用法：./do.sh sd [ls|fw|file] …"
      ;;
  esac
}

sd_menu() {
  local choice id
  while true; do
    choice="$(prompt_menu "SD 卡" --back --default=1 \
      "all:上传全部固件" \
      "ls:列出 cadv" \
      "fw:上传一个固件" \
      "file:上传文件到 cadv")"
    case "$choice" in
      "") return 0 ;;
      all)
        (cmd_sd_fw all) || log_error "执行失败（sd fw）"
        pause_menu
        ;;
      ls)
        (cmd_sd_ls) || log_error "执行失败（sd）"
        pause_menu
        ;;
      fw)
        id="$(pick_fw "上传哪个固件")"
        [ -n "$id" ] || continue
        (cmd_sd_fw "$id") || log_error "执行失败（sd fw）"
        pause_menu
        ;;
      file)
        (cmd_sd_file) || log_error "执行失败（sd file）"
        pause_menu
        ;;
    esac
  done
}

# ---------- Moddable / TypeScript ----------

need_moddable() {
  if [ -z "${MODDABLE:-}" ] || [ ! -d "${MODDABLE:-}" ]; then
    if [ -d "$ROOT/third_party/moddable" ]; then
      export MODDABLE="$ROOT/third_party/moddable"
    else
      log_die "未设置 MODDABLE。先按 fw/clock/README.md 安装 Moddable SDK，并 export MODDABLE=..."
    fi
  fi
  # ensure mcconfig on PATH (common mac layout)
  if ! command -v mcconfig >/dev/null 2>&1; then
    local cand="$MODDABLE/build/bin/mac/release"
    [ -d "$cand" ] && export PATH="$cand:$PATH"
  fi
  command -v mcconfig >/dev/null 2>&1 || log_die "找不到 mcconfig（MODDABLE=${MODDABLE}）"
}

# Prints ssid=… / password=… lines for mcconfig from env or fw/<id>/wifi.local.json.
ts_wifi_args() {
  local id="$1"
  local ssid="${WIFI_SSID:-}" password="${WIFI_PASSWORD:-}" file="$FW_ROOT/$id/wifi.local.json"
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
  local id found=0
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    log_success "固件 $id（$(fw_label "$id")）"
    found=1
  done < <(fw_ids)
  [ "$found" -eq 1 ] || log_error "fw/ 下没有固件"
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
  local id want=0
  id="$(require_fw "${1:-}")"
  [ -n "$id" ] || return 0
  if fw_uses_wordbank "$id"; then
    want=1
  fi
  refresh_generated "$want"
  need_moddable
  local mc_args=(-d -m -dn -p mac)
  if [ -d "$FW_ROOT/$id/sample" ]; then
    mc_args+=("files=$FW_ROOT/$id/sample")
    log_info "模拟文件根：fw/${id}/sample"
  fi
  log_info "桌面模拟 $(fw_label "$id")（${id}，-dn 不弹 xsbug）"
  (cd "$FW_ROOT/$id" && mcconfig "${mc_args[@]}")
}

need_idf() {
  # Prefer brew python@3.12 — system/homebrew python3 may be 3.14 and break IDF venv
  export PATH="/opt/homebrew/opt/python@3.12/libexec/bin:/opt/homebrew/opt/python@3.12/bin:$PATH"
  export IDF_GITHUB_ASSETS="${IDF_GITHUB_ASSETS:-dl.espressif.com/github_assets}"
  if [ -z "${IDF_PATH:-}" ] || [ ! -f "${IDF_PATH}/export.sh" ]; then
    export IDF_PATH="${HOME}/esp32/esp-idf-v6.1"
  fi
  [ -f "$IDF_PATH/export.sh" ] || log_die "缺少 ESP-IDF：${IDF_PATH}（安装未完成）"
  [ -d "$HOME/.espressif/tools/xtensa-esp-elf" ] || log_die "Espressif 工具未装完（缺 xtensa-esp-elf）。等 install 结束后再试"
  [ -d "$HOME/.espressif/tools/riscv32-esp-elf" ] || log_die "Espressif 工具未装完（缺 riscv32-esp-elf）。等 install 结束后再试"
  ls -d "$HOME/.espressif/python_env"/idf* >/dev/null 2>&1 || log_die "IDF python_env 未就绪。等 install-python-env 结束后再试"
  if [ -z "${CADV_IDF_READY:-}" ]; then
    # shellcheck disable=SC1091
    source "$IDF_PATH/export.sh"
    CADV_IDF_READY=1
  fi
}

# The launcher owns USB Serial/JTAG. A debug build's xsbug reader consumes
# every byte on that port, so the host cannot upload through the device.
esp_mc() {
  if [ "${1:-}" = "sd" ]; then
    ESP_MC=(-m -p esp32/esp32s3_cdc)
  else
    ESP_MC=(-d -m -dn -p esp32/esp32s3_cdc)
  fi
}

# Compile the ESP32 image and stop before esptool. Same bin flash writes at 0x10000.
build_fw_image() {
  local id="$1" want=0
  if fw_uses_wordbank "$id"; then
    want=1
  fi
  refresh_generated "$want"
  need_moddable
  need_idf
  local wifi_args=() line
  if [ -f "$FW_ROOT/$id/wifi.local.json.example" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] && wifi_args+=("$line")
    done < <(ts_wifi_args "$id")
  fi
  esp_mc "$id"
  if [ "${#wifi_args[@]}" -gt 0 ]; then
    (cd "$FW_ROOT/$id" && mcconfig "${ESP_MC[@]}" -t build "${wifi_args[@]}")
  else
    (cd "$FW_ROOT/$id" && mcconfig "${ESP_MC[@]}" -t build)
  fi
}

cmd_ts_flash() {
  local id want=0
  # The chip only holds the launcher. Other firmware is chosen on the device.
  id="${1:-sd}"
  fw_exists "$id" || log_die "没有固件：$id（可选：$(fw_ids | tr '\n' ' ')）"
  if fw_uses_wordbank "$id"; then
    want=1
  fi
  refresh_generated "$want"
  need_moddable
  need_idf

  local wifi_args=() line
  if [ -f "$FW_ROOT/$id/wifi.local.json.example" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] && wifi_args+=("$line")
    done < <(ts_wifi_args "$id")
    if [ "${#wifi_args[@]}" -eq 0 ]; then
      log_warn "未配置 Wi-Fi：复制 fw/${id}/wifi.local.json.example → wifi.local.json 后重烧，否则时钟停在 1970"
    else
      log_info "Wi-Fi SSID 已传入 mcconfig（密码不打印）"
    fi
  fi

  log_info "烧录 $(fw_label "$id")（${id}）到 esp32/esp32s3_cdc"
  esp_mc "$id"
  # -dn builds a debug image but does not launch xsbug. serial2xsbug then
  # exits non-zero after a successful flash. esptool 4 prints "Hash of data
  # verified"; esptool 5 prints "verified" and "Hard resetting via RTS pin".
  # The launcher is not a debug image: its USB port carries file uploads.
  # bash 3.2 + set -u: empty "${arr[@]}" is "unbound variable" — branch instead.
  local log rc
  log="$(mktemp "${TMPDIR:-/tmp}/cadv-flash.XXXXXX")"
  set +e
  set +o pipefail
  if [ "${#wifi_args[@]}" -gt 0 ]; then
    (cd "$FW_ROOT/$id" && mcconfig "${ESP_MC[@]}" "${wifi_args[@]}") 2>&1 | tee "$log"
  else
    (cd "$FW_ROOT/$id" && mcconfig "${ESP_MC[@]}") 2>&1 | tee "$log"
  fi
  rc=${PIPESTATUS[0]}
  set -o pipefail
  set -e
  if [ "$rc" -ne 0 ] && grep -qE "Hash of data verified|Hard resetting via RTS pin" "$log"; then
    log_warn "xsbug 没开，调试器连接失败。固件已经写入。"
    rc=0
  fi
  rm -f "$log"
  if [ "$rc" -ne 0 ]; then
    # ${rc}: bash 3.2 treats $rc（ as a multi-byte var name
    log_die "mcconfig 退出码 ${rc}"
  fi
  log_success "已烧录 $(fw_label "$id")。板子按 RESET。"
  if [ "$id" = "sd" ]; then
    log_info "上传固件可以不拔卡：USB 接着，等启动器菜单出来，再选上传。"
  fi
}

run() {
  local cmd="$1"
  shift || true
  case "$cmd" in
    ts-check | check) cmd_ts_check ;;
    ts-sim | sim) cmd_ts_sim "$@" ;;
    ts-flash | flash) cmd_ts_flash "$@" ;;
    sd) cmd_sd "$@" ;;
    sd-fw) cmd_sd_fw "$@" ;;
    sd-file) cmd_sd_file "$@" ;;
    gen-font | font) cmd_gen_font "$@" ;;
    gen-words) cmd_gen_words ;;
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
  local choice id
  while true; do
    choice="$(prompt_menu "cadv" --back --default=1 \
      "flash:烧录启动器" \
      "sim:桌面模拟" \
      "sd:SD 卡（列出 / 上传）" \
      "ts-check:检查 Moddable / TS 环境" \
      "gen-font:生成 UI BMFont" \
      "gen-words:从 alice/data 生成词库" \
      "port:列出串口" \
      "clean:清理临时日志" \
      "help:命令说明" \
      "quit:退出")"
    case "$choice" in
      "" | quit) return 0 ;;
      flash)
        (run flash) || log_error "执行失败（flash）"
        pause_menu
        ;;
      sim)
        id="$(pick_fw "选择固件")"
        # 取消固件选择：回到主菜单，不暂停
        [ -n "$id" ] || continue
        (run sim "$id") || log_error "执行失败（sim）"
        pause_menu
        ;;
      sd)
        sd_menu
        ;;
      *)
        (run "$choice") || log_error "执行失败（${choice}）"
        pause_menu
        ;;
    esac
  done
}

if [ "${CADV_LIB:-}" = "1" ]; then
  :
elif [ $# -eq 0 ]; then
  if [ -t 0 ]; then
    main_menu
  else
    usage
  fi
else
  run "$@"
fi

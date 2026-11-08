#!/usr/bin/env bash
# cadv 常用命令入口。无参数进入交互菜单；具体做法仍在本脚本命令函数里，这里做转发。
#
# 固件在 fw/<id>/（manifest.json + 一行 label）。do.sh 按目录发现，不写死名单。
#   ./do.sh                         # 交互菜单。烧录直接烧基座；模拟会再选固件
#   ./do.sh flash                   # 把基座烧进芯片，然后回到菜单。其它固件放 SD 卡，在设备上选
#   ./do.sh flash <id>              # 仍可把某一个直接烧进芯片，会盖掉基座
#   ./do.sh sim clock               # 桌面模拟某一个固件
#   fw/<id>/sample 存在时，模拟把文件根指到该目录。
#   菜单里 Esc、← 或 BS 返回上一级。主菜单再按一次即退出。
#   模拟不写 id 时列出 fw/*/label。菜单「上传固件」可多选：空格勾选，a 全选，不含基座。取消则什么都不做。
#   构建/模拟时自动判断：词库或字体比源文件旧就重做。拼写或查词才检查词库。
#   CADV_REFRESH=0 跳过；=ask 改回先问再生成。
#   ./do.sh ts-check                # 检查 MODDABLE / mcconfig，并扫 Piu commandList 风险
#   ./do.sh port                    # 列出可用串口
#   ./do.sh port free               # 结束占用串口的 idf_monitor / sd_link 等，再列出
#   ./do.sh gen-font                # 用 fontbm 生成 shared/fonts/UI-Bold-20（思源 Bold）
#   ./do.sh gen-words               # 从 ../alice/data 生成词库
#                                   # 拼写：wordbank.bin、junior.bin（junior 同步到 sample）
#                                   # 查词：fw/dict/lex.bin，并同步到 sample
#   ./do.sh sd fw words             # 固件镜像 + fw/words 下可选词库（*.bin，不含内置 wordbank）
#   ./do.sh sd fw dict              # 固件镜像 + cadv/dict/lex.bin
#   ./do.sh sd bank                 # 只传词库，不传固件。菜单：拼写包、查词、全部
#   ./do.sh sd bank dict            # 只传 cadv/dict/lex.bin
#   ./do.sh clean                   # 清临时日志
#   ./do.sh sd                      # 列出卡上的 cadv/
#   菜单「列出 cadv」可多选删除：空格勾选，a 全选，回车后再确认。Esc、← 或 BS 不删。
#   ./do.sh sd rm clock.bin         # 删除 cadv 里的这些文件。可以写多个相对路径
#   卡在板子上时，删除要这一版基座。旧的会提示先 ./do.sh flash。
#   ./do.sh sd fw                  # 把除基座以外的全部固件拷进 cadv/（不烧进芯片）
#   ./do.sh sd fw clock             # 只拷一个：cadv/clock.bin 和一行名字
#   ./do.sh sd file ./a.txt         # 把文件或目录拷进 cadv/
#   ./do.sh sd mount                # 把已弹出但仍插着的 优盘（fw/usb）重新挂上
#   卡插在电脑上时直接写卡。没插卡、板子用 USB 连着并且跑着基座时，经串口写入板子上的卡。
#   板子跑「优盘」固件时，卡以 优盘出现；若在 Finder 里弹出过，sd 命令会尝试自动再挂。
#   CADV_SD=/Volumes/名字 指定卡。CADV_PORT=/dev/cu.usbmodemXXX 指定串口。
#   CADV_LINK=device 强制走板子；CADV_LINK=0 只认插在电脑上的卡。
#   只上传一个：镜像比 fw/<id> 或 shared 旧时先问要不要重编。
#   上传全部，或一次传多个（菜单里勾选多项也一样）：过时的直接重编，不再逐个询问。
#   CADV_SD_BUILD=1 每个都重编；=0 仍用旧镜像；=ask 改回逐个询问。
#   基座要先 ./do.sh flash，这一版才从 USB 收文件。
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

# read -n / a raw tty (min 0) makes the next line read return EOF at once.
# Callers were treating that EOF as "n".
tty_cook() {
  stty icanon echo icrnl isig iexten </dev/tty 2>/dev/null || true
}

pause_menu() {
  [ -t 0 ] || return 0
  echo ""
  tty_cook
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

# idf.py monitor keeps the USB port exclusively. mcconfig only kills serial2xsbug,
# so a previous flash still running (or orphaned) makes esptool fail with
# "Resource temporarily unavailable".
release_upload_port() {
  local p pid pgid self cmd
  self="$(ps -o pgid= -p $$ | tr -d '[:space:]')"
  for p in /dev/cu.usbmodem* /dev/cu.wchusbserial* /dev/cu.usbserial*; do
    [ -e "$p" ] || continue
    while IFS= read -r pid; do
      [ -n "$pid" ] || continue
      [ "$pid" -eq $$ ] 2>/dev/null && continue
      cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
      case "$cmd" in
        *esp_idf_monitor*|*idf.py*|*idf_monitor*|*esptool*|*serial2xsbug*|*sd_link.py*)
          pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
          if [ -n "$pgid" ] && [ "$pgid" != "$self" ] && [ "$pgid" -gt 1 ] 2>/dev/null; then
            log_warn "串口 $p 被占用，结束进程组 $pgid"
            kill -TERM "-$pgid" 2>/dev/null || true
          else
            log_warn "串口 $p 被占用，结束 pid $pid"
            kill -TERM "$pid" 2>/dev/null || true
          fi
          ;;
        *)
          # Exclusive open leftovers (python -c serial, screen, …).
          log_warn "串口 $p 被 pid $pid 占用，结束它"
          kill -TERM "$pid" 2>/dev/null || true
          ;;
      esac
    done < <(lsof -t "$p" 2>/dev/null | sort -u)
  done
  sleep 0.5
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

# Optional second arg is an id to leave off the menu (the launcher, when uploading).
pick_fw() {
  local title="$1" except="${2:-}" id opts=()
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    [ -n "$except" ] && [ "$id" = "$except" ] && continue
    opts+=("$id:$(fw_label "$id")")
  done < <(fw_ids)
  [ "${#opts[@]}" -gt 0 ] || log_die "fw/ 下没有固件。新增：建 fw/<id>/，放入 manifest.json 和一行 label"
  prompt_menu "$title" --back "${opts[@]}"
}

# Card images only. Comma-separated ids. Nothing starts checked; a selects every row.
# Empty stdout means cancel.
pick_fw_multi() {
  local title="$1" id opts=()
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    [ "$id" = "sd" ] && continue
    opts+=("$id:$(fw_label "$id")")
  done < <(fw_ids)
  [ "${#opts[@]}" -gt 0 ] || log_die "没有可上传的固件"
  prompt_multi_menu "$title" --back --default=0 "${opts[@]}"
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

# 拼写 embeds a bank. 查词 reads cadv/dict/lex.bin, built by the same script.
fw_needs_bank() {
  if fw_uses_wordbank "$1"; then
    return 0
  fi
  [ "$1" = "dict" ]
}

# ---------- commands ----------

cmd_port() {
  local found=0 p
  case "${1:-}" in
    "" | list) ;;
    free)
      release_upload_port
      log_success "已释放串口占用"
      ;;
    *)
      log_die "用法：./do.sh port [list|free]"
      ;;
  esac
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

# Quiz banks or the lookup lexicon are older than the generator, lists,
# or the gloss and phonetic sources.
wordbank_stale() {
  local out="$FW_ROOT/words/wordbank.bin"
  local junior="$FW_ROOT/words/junior.bin"
  local lex="$FW_ROOT/dict/lex.bin"
  local sample="$FW_ROOT/dict/sample/cadv/dict/lex.bin"
  local alice="$ROOT/../alice"
  local hit meta csv f
  [ -f "$out" ] || return 0
  [ -f "$junior" ] || return 0
  [ -f "$lex" ] || return 0
  [ -f "$sample" ] || return 0
  for f in "$out" "$junior" "$lex" "$sample"; do
    [ "$ROOT/scripts/gen-wordbank.mjs" -nt "$f" ] && return 0
  done
  for meta in "$alice/assets/data/library.json" "$alice/assets/data/ecdict-meta.json"; do
    [ -f "$meta" ] || continue
    for f in "$out" "$junior" "$lex" "$sample"; do
      [ "$meta" -nt "$f" ] && return 0
    done
  done
  for csv in "$ROOT/.cache/ecdict.csv" "$alice/.cache/ecdict.csv"; do
    [ -f "$csv" ] || continue
    for f in "$out" "$junior" "$lex" "$sample"; do
      [ "$csv" -nt "$f" ] && return 0
    done
  done
  if [ -d "$alice/data/闽教版小学" ]; then
    hit="$(find "$alice/data/闽教版小学" -name '*.txt' \( -newer "$out" -o -newer "$junior" -o -newer "$lex" -o -newer "$sample" \) -print -quit)"
    [ -n "$hit" ] && return 0
  fi
  if [ -d "$alice/data/初中2182" ]; then
    hit="$(find "$alice/data/初中2182" -name '*.txt' \( -newer "$out" -o -newer "$junior" -o -newer "$lex" -o -newer "$sample" \) -print -quit)"
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

# Rebuild a stale word bank (only if this firmware embeds one), then the shared font.
# Default: regenerate when stale. CADV_REFRESH=0 skips; =ask prompts on a terminal.
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

  case "${CADV_REFRESH:-1}" in
    0)
      log_warn "${msg}。已跳过（CADV_REFRESH=0）"
      return 0
      ;;
    ask)
      if [ -t 0 ] || [ -t 1 ]; then
        tty_cook
        read -r -p "${msg}。现在生成？ [Y/n] " ans </dev/tty || ans=n
        case "${ans:-Y}" in
          n|N|no|NO|否)
            log_warn "已跳过，继续用现有词库和字体"
            return 0
            ;;
        esac
      else
        log_warn "${msg}。非交互已跳过；去掉 CADV_REFRESH=ask 可自动生成"
        return 0
      fi
      ;;
  esac

  log_info "$msg"
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

# Parent whole-disk node for a slice: disk6s1 → disk6.
sd_parent_disk() {
  local node="${1#/dev/}"
  case "$node" in
    disk*s*) printf '%s\n' "${node%%s*}" ;;
    disk*) printf '%s\n' "$node" ;;
    *) return 1 ;;
  esac
}

# 1 if this USB volume looks like the Cardputer 「USB 盘」firmware (TinyUSB MSC).
sd_is_usb_disk_fw() {
  local node="$1" parent info media
  parent="$(sd_parent_disk "$node")" || return 1
  info="$(diskutil info "$parent" 2>/dev/null)" || return 1
  media="$(diskutil_field "$info" "Device / Media Name")"
  case "$(printf '%s' "$media" | tr '[:upper:]' '[:lower:]')" in
    *msc* | *tinyusb* | *cadv*) return 0 ;;
  esac
  return 1
}

# Unmounted external USB FAT partitions as device nodes (diskNsM), one per line.
# With arg "msc": only TinyUSB/CADV MSC. With "all": any external USB FAT.
sd_unmounted_usb_fat() {
  local mode="${1:-msc}" line id info fs mount where proto
  while IFS= read -r line; do
    id="$(printf '%s\n' "$line" | awk '{print $NF}')"
    case "$id" in
      disk*s*) ;;
      *) continue ;;
    esac
    info="$(diskutil info "$id" 2>/dev/null)" || continue
    fs="$(diskutil_field "$info" "File System Personality" | tr '[:upper:]' '[:lower:]')"
    case "$fs" in
      *fat* | *dos*) ;;
      *) continue ;;
    esac
    where="$(diskutil_field "$info" "Device Location")"
    case "$where" in
      Internal) continue ;;
    esac
    proto="$(diskutil_field "$info" "Protocol")"
    case "$proto" in
      USB) ;;
      *) continue ;;
    esac
    mount="$(diskutil_field "$info" "Mount Point")"
    case "$mount" in
      /Volumes/*) continue ;;
    esac
    if [ "$mode" = "msc" ] && ! sd_is_usb_disk_fw "$id"; then
      continue
    fi
    printf '%s\n' "$id"
  done < <(diskutil list external physical 2>/dev/null)
}

# Mount one partition; print mount point on success.
sd_mount_node() {
  local id="$1" info mount
  if ! diskutil mount "$id" >/dev/null 2>&1; then
    log_warn "挂载失败：$id"
    return 1
  fi
  info="$(diskutil info "$id" 2>/dev/null)" || return 1
  mount="$(diskutil_field "$info" "Mount Point")"
  case "$mount" in
    /Volumes/*)
      [ -d "$mount" ] || return 1
      printf '%s\n' "$mount"
      return 0
      ;;
  esac
  return 1
}

# Remount ejected Cardputer USB-disk volumes. Prints each new mount point.
# Returns 0 if at least one mounted, 1 if nothing to do / all failed.
sd_mount_ejected_usb() {
  local id mount n=0
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    mount="$(sd_mount_node "$id")" || continue
    log_success "已挂上 $mount（$id）"
    printf '%s\n' "$mount"
    n=$((n + 1))
  done < <(sd_unmounted_usb_fat msc)
  [ "$n" -gt 0 ]
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

# Collect mounted candidates; if none, remount ejected TinyUSB MSC then retry.
sd_collect_vols() {
  local v vols=()
  while IFS= read -r v; do
    [ -n "$v" ] || continue
    vols+=("$v")
  done < <(sd_candidates)
  if [ "${#vols[@]}" -eq 0 ]; then
    sd_mount_ejected_usb >/dev/null || true
    while IFS= read -r v; do
      [ -n "$v" ] || continue
      vols+=("$v")
    done < <(sd_candidates)
  fi
  # bash 3.2 + set -u: empty "${vols[@]}" is unbound.
  if [ "${#vols[@]}" -eq 0 ]; then
    return 0
  fi
  for v in "${vols[@]}"; do
    printf '%s\n' "$v"
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
  done < <(sd_collect_vols)
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
  # Same exclusive-port cleanup as flash: a hung prior do.sh / sd_link / idf_monitor
  # otherwise leaves "Resource temporarily unavailable" or a stuck ping.
  release_upload_port
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
  port="$(detect_port)" || log_die "没有 FAT/exFAT 的卡，也没找到板子的串口。把卡插到电脑，或用 USB 连上板子（先 ./do.sh flash 基座）。"
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

link_rm() {
  local py port
  py="$(link_python)"
  port="$1"
  shift
  "$py" "$ROOT/scripts/sd_link.py" rm "$port" "$@"
}

# The device only opens this directory. The rest of a large card is ignored.
SD_DIR=cadv

fw_image() {
  need_moddable
  # Card images are release builds. A debug image waits on xsbug and never draws.
  printf '%s\n' "$MODDABLE/build/bin/esp32/esp32s3_cdc/release/$1/xs_esp32.bin"
}

# Optional SD word packs: fw/words/<id>.bin except the flash-embedded
# wordbank.bin. Live under cadv/words/ so the launcher does not treat them
# as firmware. Device 来源 menu lists 内置 + these file stems.
WORDS_BANK_DIR="${SD_DIR}/words"

words_pack_ids() {
  local f base
  for f in "$FW_ROOT/words"/*.bin; do
    [ -f "$f" ] || continue
    base="$(basename "$f" .bin)"
    [ "$base" = "wordbank" ] && continue
    printf '%s\n' "$base"
  done | sort
}

words_pack_src() {
  printf '%s\n' "$FW_ROOT/words/$1.bin"
}

dict_lex_src() {
  printf '%s\n' "$FW_ROOT/dict/lex.bin"
}

# Host-mounted card: cadv/dict/lex.bin, not a firmware image.
sd_put_dict_host() {
  local home="$1" src dest
  src="$(dict_lex_src)"
  if [ ! -f "$src" ]; then
    log_warn "没有查词库 $src，跳过 ${SD_DIR}/dict/lex.bin"
    return 0
  fi
  mkdir -p "$home/dict"
  dest="$home/dict/lex.bin"
  cp -X -f "$src" "$dest"
  log_success "查词 → ${SD_DIR}/dict/lex.bin（$(human_bytes "$(wc -c <"$dest" | tr -d ' ')")）"
}

words_pack_exists() {
  [ -n "${1:-}" ] && [ -f "$(words_pack_src "$1")" ]
}

pick_words_pack() {
  local title="$1" id opts=() n=0
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    opts+=("$id:拼写 ${id}.bin → ${WORDS_BANK_DIR}/")
    n=$((n + 1))
  done < <(words_pack_ids)
  if [ -f "$(dict_lex_src)" ]; then
    opts+=("dict:查词 lex.bin → ${SD_DIR}/dict/")
    n=$((n + 1))
  fi
  [ "$n" -gt 0 ] || log_die "没有可上传的词库。先 ./do.sh gen-words"
  if [ "$n" -gt 1 ]; then
    prompt_menu "$title" --back --default=1 "all:全部" "${opts[@]}"
  else
    prompt_menu "$title" --back "${opts[@]}"
  fi
}

# none / all → every spelling pack, plus the lookup lexicon when the file exists.
# "dict" is cadv/dict/lex.bin. A cancelled menu returns empty and does not upload.
require_words_packs() {
  local id ids=() arg all=0
  for arg in "$@"; do
    [ "$arg" = "all" ] && all=1
  done
  if [ $# -eq 0 ] || [ "$all" -eq 1 ]; then
    while IFS= read -r id; do
      [ -n "$id" ] || continue
      ids+=("$id")
    done < <(words_pack_ids)
    if [ -f "$(dict_lex_src)" ]; then
      ids+=("dict")
    fi
  else
    for id in "$@"; do
      if [ "$id" = "dict" ]; then
        [ -f "$(dict_lex_src)" ] || log_die "没有查词库 $(dict_lex_src)。先 ./do.sh gen-words"
        ids+=("dict")
        continue
      fi
      words_pack_exists "$id" || log_die "没有词库：${id}（可选：$(bank_id_list)）"
      ids+=("$id")
    done
  fi
  [ "${#ids[@]}" -gt 0 ] || log_die "没有可上传的词库。先 ./do.sh gen-words"
  printf '%s\n' "${ids[@]}"
}

bank_id_list() {
  local id out=""
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    out="${out}${id} "
  done < <(words_pack_ids)
  if [ -f "$(dict_lex_src)" ]; then
    out="${out}dict "
  fi
  printf '%s\n' "${out% }"
}

# Host-mounted card: copy named packs under cadv/words/ (not auto-override).
sd_put_words_packs_host() {
  local home="$1" id src dest
  shift
  [ $# -gt 0 ] || return 0
  mkdir -p "$home/words"
  for id in "$@"; do
    src="$(words_pack_src "$id")"
    if [ ! -f "$src" ]; then
      log_warn "没有词库 $src，跳过 ${WORDS_BANK_DIR}/${id}.bin"
      continue
    fi
    dest="$home/words/${id}.bin"
    cp -X -f "$src" "$dest"
    log_success "词库 → ${WORDS_BANK_DIR}/${id}.bin（$(human_bytes "$(wc -c <"$dest" | tr -d ' ')")）"
  done
}

# Spelling packs and the lookup lexicon. No firmware image.
cmd_sd_bank() {
  local route kind root id src ids=() args=() words=() put_dict=0
  if [ $# -eq 0 ] && [ -t 0 ]; then
    id="$(pick_words_pack "上传哪个词库")"
    [ -n "$id" ] || return 0
    set -- "$id"
  fi
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    ids+=("$id")
  done < <(require_words_packs "$@")
  [ "${#ids[@]}" -gt 0 ] || return 0
  for id in "${ids[@]}"; do
    if [ "$id" = "dict" ]; then
      put_dict=1
    else
      words+=("$id")
    fi
  done
  route="$(sd_route)" || return $?
  [ -n "$route" ] || return 0
  kind="${route%%$'\t'*}"
  root="${route#*$'\t'}"
  if [ "$kind" = "device" ]; then
    if [ "$put_dict" -eq 1 ] && [ "${#words[@]}" -eq 0 ]; then
      log_info "经 USB 写入 ${SD_DIR}/dict/（${root}）"
    elif [ "$put_dict" -eq 1 ]; then
      log_info "经 USB 写入词库（${root}）"
    else
      log_info "经 USB 写入 ${WORDS_BANK_DIR}/（${root}）"
    fi
    link_ping "$root"
    if [ "${#words[@]}" -gt 0 ]; then
      for id in "${words[@]}"; do
        src="$(words_pack_src "$id")"
        args+=("$src" "words/${id}.bin")
      done
    fi
    if [ "$put_dict" -eq 1 ]; then
      args+=("$(dict_lex_src)" "dict/lex.bin")
    fi
    link_put "$root" "${args[@]}"
    if [ "${#words[@]}" -gt 0 ]; then
      for id in "${words[@]}"; do
        src="$(words_pack_src "$id")"
        log_success "词库 → ${WORDS_BANK_DIR}/${id}.bin（$(human_bytes "$(wc -c <"$src" | tr -d ' ')")）"
      done
    fi
    if [ "$put_dict" -eq 1 ]; then
      src="$(dict_lex_src)"
      log_success "查词 → ${SD_DIR}/dict/lex.bin（$(human_bytes "$(wc -c <"$src" | tr -d ' ')")）"
    fi
    return 0
  fi
  mkdir -p "$root/$SD_DIR"
  if [ "${#words[@]}" -gt 0 ]; then
    sd_put_words_packs_host "$root/$SD_DIR" "${words[@]}"
  fi
  if [ "$put_dict" -eq 1 ]; then
    sd_put_dict_host "$root/$SD_DIR"
  fi
  sync || true
}

# Newest fw/<id> or shared file newer than the image, relative to the repo.
# Empty when the image is missing or current.
fw_image_newer_source() {
  local id="$1" bin best best_m m f
  bin="$(fw_image "$id")"
  [ -f "$bin" ] || return 0
  best=""
  best_m=0
  while IFS= read -r f; do
    m="$(stat -f '%m' "$f")"
    if [ "$m" -gt "$best_m" ]; then
      best_m="$m"
      best="$f"
    fi
  done < <(find "$FW_ROOT/$id" "$ROOT/shared" -type f \
    ! -name '.DS_Store' \
    -newer "$bin")
  [ -n "$best" ] || return 0
  printf '%s\n' "${best#"$ROOT"/}"
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

# Relative path inside cadv. Matches the device: no absolute path, no "..",
# no hidden component, at most 80 bytes.
sd_byte_len() {
  printf '%s' "$1" | wc -c | tr -d ' '
}

sd_rel_ok() {
  local rel="$1" rest part n i c
  [ -n "$rel" ] || return 1
  n="$(sd_byte_len "$rel")"
  [ "$n" -ge 1 ] && [ "$n" -le 80 ] || return 1
  case "$rel" in
    /* | */ | *\\*) return 1 ;;
  esac
  i=0
  while [ "$i" -lt "${#rel}" ]; do
    c="${rel:$i:1}"
    case "$c" in
      [[:cntrl:]] | $'\177') return 1 ;;
    esac
    i=$((i + 1))
  done
  rest="$rel"
  while [ -n "$rest" ]; do
    case "$rest" in
      /*) return 1 ;;
    esac
    part="${rest%%/*}"
    [ -n "$part" ] || return 1
    n="$(sd_byte_len "$part")"
    [ "$n" -ge 1 ] && [ "$n" -le 64 ] || return 1
    case "$part" in
      . | .. | .*) return 1 ;;
    esac
    if [ "$rest" = "$part" ]; then
      return 0
    fi
    rest="${rest#*/}"
  done
  return 1
}

# size<TAB>path. Skips hidden names and in-progress *.part uploads.
sd_collect_files() {
  local kind="$1" root="$2" dir out size name f rel bytes
  if [ "$kind" = "device" ]; then
    out="$(link_ls "$root")" || return $?
    while IFS=$'\t' read -r size name; do
      [ -n "${name:-}" ] || continue
      sd_rel_ok "$name" || continue
      case "$name" in
        *.part) continue ;;
      esac
      case "$size" in
        ''|*[!0-9]*) continue ;;
      esac
      printf '%s\t%s\n' "$size" "$name"
    done <<< "$out"
    return 0
  fi
  dir="$root/$SD_DIR"
  [ -d "$dir" ] || return 0
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    [ -L "$f" ] && continue
    [ -f "$f" ] || continue
    rel="${f#"$dir"/}"
    sd_rel_ok "$rel" || continue
    case "$rel" in
      *.part) continue ;;
    esac
    bytes="$(wc -c <"$f" | tr -d ' ')"
    printf '%s\t%s\n' "$bytes" "$rel"
  done < <(find "$dir" -type f ! -name '.*' ! -name '.DS_Store' ! -name '*.part' ! -path '*/.*' | sort)
}

# 0 = yes, 2 = cancelled. No prompt when stdin is not a terminal.
sd_confirm_rm() {
  local ans rel
  [ $# -gt 0 ] || return 2
  if [ ! -t 0 ]; then
    return 0
  fi
  printf '将删除：\n' >&2
  for rel in "$@"; do
    printf '  %s/%s\n' "$SD_DIR" "$rel" >&2
  done
  read -r -p "删除这 $# 个文件？[y/N] " ans </dev/tty || ans=n
  case "$ans" in
    y|Y|yes|YES|是) return 0 ;;
  esac
  log_info "已取消"
  return 2
}

sd_rm_host_one() {
  local home="$1" rel="$2" dir base canon home_canon parent
  sd_rel_ok "$rel" || log_die "文件名不能用：$rel"
  if [ ! -d "$home" ]; then
    log_warn "没有这个文件：${SD_DIR}/$rel"
    return 0
  fi
  dir="$home/$(dirname "$rel")"
  base="$(basename "$rel")"
  if [ -L "$dir/$base" ]; then
    log_die "不删除链接：${SD_DIR}/$rel"
  fi
  if [ ! -f "$dir/$base" ]; then
    log_warn "没有这个文件：${SD_DIR}/$rel"
    return 0
  fi
  home_canon="$(cd "$home" && pwd -P)" || log_die "打不开 ${SD_DIR}"
  canon="$(cd "$dir" && pwd -P)/$base" || log_die "打不开 ${SD_DIR}/$rel"
  case "$canon" in
    "$home_canon"/*) ;;
    *) log_die "路径跑出 ${SD_DIR}：$rel" ;;
  esac
  rm -f -- "$canon"
  log_success "已删除 ${SD_DIR}/$rel"
  parent="$(dirname "$canon")"
  while [ "$parent" != "$home_canon" ] && [ "$parent" != "/" ]; do
    rmdir "$parent" 2>/dev/null || break
    parent="$(dirname "$parent")"
  done
}

sd_rm_files() {
  local kind="$1" root="$2" rel home
  shift 2
  [ $# -gt 0 ] || return 0
  if [ "$kind" = "device" ]; then
    log_info "经 USB 删除 ${SD_DIR}/ 里的文件（${root}）"
    link_rm "$root" "$@"
    for rel in "$@"; do
      log_success "已删除 ${SD_DIR}/$rel"
    done
    return 0
  fi
  home="$root/$SD_DIR"
  for rel in "$@"; do
    sd_rm_host_one "$home" "$rel"
  done
  sync || true
}

# 0 = listed or deleted, 2 = cancelled. Interactive: multi-select, then confirm.
cmd_sd_pick_rm() {
  local route kind root size name csv i
  local -a sizes=() names=() opts=() picks=() chosen=()
  route="$(sd_route)" || return $?
  [ -n "$route" ] || return 2
  kind="${route%%$'\t'*}"
  root="${route#*$'\t'}"
  while IFS=$'\t' read -r size name; do
    [ -n "${name:-}" ] || continue
    sizes+=("$size")
    names+=("$name")
  done < <(sd_collect_files "$kind" "$root")
  if [ "${#names[@]}" -eq 0 ]; then
    if [ "$kind" = "device" ]; then
      log_info "设备上的 ${SD_DIR}/ 是空的（${root}）"
    elif [ ! -d "$root/$SD_DIR" ]; then
      log_info "还没有 ${SD_DIR}。上传固件或文件时会创建。"
    else
      log_info "${SD_DIR} 是空的"
    fi
    return 0
  fi
  if [ ! -t 0 ]; then
    i=0
    while [ "$i" -lt "${#names[@]}" ]; do
      printf '%s\t%s\n' "${names[$i]}" "$(human_bytes "${sizes[$i]}")"
      i=$((i + 1))
    done
    return 0
  fi
  i=0
  while [ "$i" -lt "${#names[@]}" ]; do
    opts+=("$i:${names[$i]}  $(human_bytes "${sizes[$i]}")")
    i=$((i + 1))
  done
  csv="$(prompt_multi_menu "删除哪些文件" --back --default=0 "${opts[@]}")"
  [ -n "$csv" ] || return 2
  IFS=',' read -ra picks <<<"$csv"
  for i in "${picks[@]}"; do
    case "$i" in
      ''|*[!0-9]*) continue ;;
    esac
    [ "$i" -lt "${#names[@]}" ] || continue
    chosen+=("${names[$i]}")
  done
  [ "${#chosen[@]}" -gt 0 ] || return 2
  sd_confirm_rm "${chosen[@]}" || return $?
  sd_rm_files "$kind" "$root" "${chosen[@]}"
}

cmd_sd_rm() {
  local rc rel route kind root
  local -a rels=()
  if [ $# -eq 0 ]; then
    if [ ! -t 0 ]; then
      log_die "用法：./do.sh sd rm <cadv 里的相对路径>…"
    fi
    cmd_sd_pick_rm && return 0
    rc=$?
    [ "$rc" -eq 2 ] && return 0
    return "$rc"
  fi
  for rel in "$@"; do
    sd_rel_ok "$rel" || log_die "文件名不能用：$rel"
    rels+=("$rel")
  done
  sd_confirm_rm "${rels[@]}" || {
    rc=$?
    [ "$rc" -eq 2 ] && return 0
    return "$rc"
  }
  route="$(sd_route)" || return $?
  [ -n "$route" ] || return 0
  kind="${route%%$'\t'*}"
  root="${route#*$'\t'}"
  sd_rm_files "$kind" "$root" "${rels[@]}"
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

# $2：ask 先问；auto 过时就编。CADV_SD_BUILD 优先：1 一律重编，0 用旧镜像，ask 逐个问。
ensure_fw_image() {
  local id="$1" policy="${2:-ask}" src newer ans
  if [ -n "${CADV_SD_BUILD:-}" ]; then
    policy="$CADV_SD_BUILD"
  fi
  src="$(fw_image "$id")"
  if [ ! -f "$src" ]; then
    log_info "还没有 $(fw_label "$id") 的镜像，先编译（不烧进芯片）"
    build_fw_image "$id"
  elif [ "$policy" = 1 ]; then
    log_info "重编 $(fw_label "$id")（不烧进芯片）"
    build_fw_image "$id"
  else
    newer="$(fw_image_newer_source "$id")"
    if [ -z "$newer" ]; then
      log_info "用已有镜像 $(date -r "$src" '+%Y-%m-%d %H:%M')"
    elif [ "$policy" = 0 ]; then
      log_warn "$(fw_label "$id") 的源文件比镜像新（${newer}，镜像 $(date -r "$src" '+%Y-%m-%d %H:%M')）。已跳过重编（CADV_SD_BUILD=0）"
    elif [ "$policy" = auto ]; then
      log_info "$(fw_label "$id") 比镜像新（${newer}）。重编（不烧进芯片）"
      build_fw_image "$id"
    elif [ -t 0 ] || [ -t 1 ]; then
      # Default is Y. A failed read used to become ans=n and upload the old image.
      tty_cook
      if ! read -r -p "$(fw_label "$id") 比镜像新（${newer}）。现在重编？ [Y/n] " ans </dev/tty; then
        log_warn "没有读到回答，已取消，不上传"
        return 1
      fi
      case "${ans:-Y}" in
        n|N|no|NO|否)
          log_warn "已跳过，继续用 $(date -r "$src" '+%Y-%m-%d %H:%M') 的镜像"
          ;;
        *)
          log_info "重编 $(fw_label "$id")（不烧进芯片）"
          build_fw_image "$id"
          ;;
      esac
    else
      log_warn "$(fw_label "$id") 的源文件比镜像新（${newer}）。非交互已跳过；上传全部会自动重编，或设 CADV_SD_BUILD=1"
    fi
  fi
  src="$(fw_image "$id")"
  [ -f "$src" ] || log_die "编译后仍没有镜像：$src"
}

cmd_sd_fw_device() {
  local port="$1" id src tmp rc=0 args=() tmps=() packs=() put_dict=0 lexsrc
  shift
  # Images are already built by cmd_sd_fw. Ping only gates the USB write.
  log_info "经 USB 写入卡上的 ${SD_DIR}/（${port}）"
  link_ping "$port"
  for id in "$@"; do
    src="$(fw_image "$id")"
    tmp="$(mktemp "${TMPDIR:-/tmp}/cadv-label.XXXXXX")"
    printf '%s\n' "$(fw_label "$id")" >"$tmp"
    tmps+=("$tmp")
    args+=("$src" "${id}.bin" "$tmp" "${id}.txt")
    if [ "$id" = "words" ]; then
      while IFS= read -r src; do
        [ -n "$src" ] || continue
        packs+=("$src")
        args+=("$(words_pack_src "$src")" "words/${src}.bin")
      done < <(words_pack_ids)
    fi
    if [ "$id" = "dict" ]; then
      lexsrc="$(dict_lex_src)"
      if [ -f "$lexsrc" ]; then
        put_dict=1
        args+=("$lexsrc" "dict/lex.bin")
      else
        log_warn "没有查词库 $lexsrc，跳过 ${SD_DIR}/dict/lex.bin"
      fi
    fi
  done
  link_put "$port" "${args[@]}" || rc=$?
  rm -f "${tmps[@]}"
  [ "$rc" -eq 0 ] || return "$rc"
  for id in "$@"; do
    src="$(fw_image "$id")"
    log_success "$(fw_label "$id") → ${SD_DIR}/${id}.bin（$(human_bytes "$(wc -c <"$src" | tr -d ' ')")）"
  done
  # bash 3.2 + set -u: empty "${packs[@]}" is unbound. No extra packs is normal.
  if [ "${#packs[@]}" -gt 0 ]; then
    for id in "${packs[@]}"; do
      src="$(words_pack_src "$id")"
      log_success "词库 → ${WORDS_BANK_DIR}/${id}.bin（$(human_bytes "$(wc -c <"$src" | tr -d ' ')")）"
    done
  fi
  if [ "$put_dict" -eq 1 ]; then
    lexsrc="$(dict_lex_src)"
    log_success "查词 → ${SD_DIR}/dict/lex.bin（$(human_bytes "$(wc -c <"$lexsrc" | tr -d ' ')")）"
  fi
}

cmd_sd_fw() {
  local route kind root id src dest home ids=() packs=() policy=ask
  if [ $# -eq 0 ] || [ "${1:-}" = "all" ]; then
    # A batch would otherwise stop on one prompt per stale image.
    policy=auto
    while IFS= read -r id; do
      [ -n "$id" ] || continue
      [ "$id" = "sd" ] && continue
      ids+=("$id")
    done < <(fw_ids)
  else
    for id in "$@"; do
      if [ "$id" = "sd" ]; then
        log_warn "跳过基座 sd，它留在芯片里"
        continue
      fi
      fw_exists "$id" || log_die "没有固件：$id（可选：$(fw_ids | tr '\n' ' ')）"
      ids+=("$id")
    done
    if [ "${#ids[@]}" -gt 1 ]; then
      policy=auto
    fi
  fi
  [ "${#ids[@]}" -gt 0 ] || log_die "没有可上传的固件"
  # Build before touching the card/port so a dead launcher still leaves fresh bins.
  for id in "${ids[@]}"; do
    ensure_fw_image "$id" "$policy"
  done
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
    src="$(fw_image "$id")"
    dest="$home/${id}.bin"
    cp -X -f "$src" "$dest"
    printf '%s\n' "$(fw_label "$id")" > "$home/${id}.txt"
    log_success "$(fw_label "$id") → ${SD_DIR}/${id}.bin（$(human_bytes "$(wc -c <"$dest" | tr -d ' ')")）"
    if [ "$id" = "words" ]; then
      packs=()
      while IFS= read -r src; do
        [ -n "$src" ] || continue
        packs+=("$src")
      done < <(words_pack_ids)
      if [ "${#packs[@]}" -gt 0 ]; then
        sd_put_words_packs_host "$home" "${packs[@]}"
      fi
    fi
    if [ "$id" = "dict" ]; then
      sd_put_dict_host "$home"
    fi
  done
  sync || true
}

# 1 if the Cardputer USB-disk composite (TinyUSB CDC serial 123456) is still plugged in.
sd_usb_disk_plugged() {
  [ -e /dev/cu.usbmodem1234561 ] && return 0
  ioreg -c IOUSBHostDevice -l -w0 2>/dev/null | grep -q 'TEST MSC Storage' && return 0
  return 1
}

cmd_sd_mount() {
  local id mount n=0 any=0
  # Prefer Cardputer USB-disk firmware volumes; if none, offer any ejected USB FAT.
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    any=1
    mount="$(sd_mount_node "$id")" || continue
    log_success "已挂上 $mount（$id）"
    n=$((n + 1))
  done < <(sd_unmounted_usb_fat msc)
  if [ "$n" -gt 0 ]; then
    return 0
  fi
  if [ "$any" -eq 0 ]; then
    while IFS= read -r id; do
      [ -n "$id" ] || continue
      any=1
      mount="$(sd_mount_node "$id")" || continue
      log_success "已挂上 $mount（$id）"
      n=$((n + 1))
    done < <(sd_unmounted_usb_fat all)
  fi
  if [ "$n" -gt 0 ]; then
    return 0
  fi
  if [ "$any" -eq 0 ]; then
    # Already mounted?
    if [ -n "$(sd_candidates | head -1)" ]; then
      while IFS= read -r mount; do
        [ -n "$mount" ] || continue
        log_info "已在：$mount"
      done < <(sd_candidates)
      return 0
    fi
    if sd_usb_disk_plugged; then
      log_die "USB 盘已弹出，分区不在了。拔插一次线，或设备上再进一次「USB 盘」"
    fi
    log_die "没有可挂的 USB FAT 盘。先在设备上打开「USB 盘」，或把卡插到电脑"
  fi
  log_die "挂载失败"
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
    bank | banks | words-bank)
      shift
      cmd_sd_bank "$@"
      ;;
    file | files)
      shift
      cmd_sd_file "$@"
      ;;
    rm | del | delete)
      shift
      cmd_sd_rm "$@"
      ;;
    mount | remount)
      shift
      cmd_sd_mount "$@"
      ;;
    *)
      log_die "用法：./do.sh sd [ls|fw|bank|file|rm|mount] …"
      ;;
  esac
}

sd_menu() {
  local choice csv rc
  local -a ids
  while true; do
    choice="$(prompt_menu "SD 卡" --back --default=1 \
      "fw:上传固件" \
      "ls:列出 cadv" \
      "bank:上传词库" \
      "file:上传文件到 cadv" \
      "mount:挂上 USB 盘")"
    case "$choice" in
      "") return 0 ;;
      fw)
        csv="$(pick_fw_multi "上传哪些固件")"
        [ -n "$csv" ] || continue
        ids=()
        IFS=',' read -ra ids <<<"$csv"
        (cmd_sd_fw "${ids[@]}") || log_error "执行失败（sd fw）"
        pause_menu
        ;;
      ls)
        rc=0
        (cmd_sd_pick_rm) || rc=$?
        if [ "$rc" -eq 2 ]; then
          continue
        fi
        [ "$rc" -eq 0 ] || log_error "执行失败（sd）"
        pause_menu
        ;;
      bank)
        (cmd_sd_bank) || log_error "执行失败（sd bank）"
        pause_menu
        ;;
      file)
        (cmd_sd_file) || log_error "执行失败（sd file）"
        pause_menu
        ;;
      mount)
        (cmd_sd_mount) || log_error "执行失败（sd mount）"
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

check_piu_lists() {
  # Heavy Port faces (7-seg / disks) need commandListLength or the panel stays black.
  if ! command -v node >/dev/null 2>&1; then
    log_warn "没有 node，跳过 Piu commandList 检查"
    return 0
  fi
  if [ "$#" -gt 0 ]; then
    node "$ROOT/scripts/check-piu-lists.mjs" "$@"
  else
    node "$ROOT/scripts/check-piu-lists.mjs"
  fi
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
  log_info "检查 Piu commandList（重绘制固件）"
  check_piu_lists
}

# macOS `open -a mcsim` after AppleScript quit often returns -600 (procNotFound).
launch_mcsim() {
  local id="$1"
  local sim="$MODDABLE/build/bin/mac/release/mcsim.app"
  local so="$MODDABLE/build/bin/mac/mc/debug/$id/mc.so"
  [ -d "$sim" ] || log_die "找不到 mcsim：$sim"
  [ -f "$so" ] || log_die "找不到镜像：$so"
  killall -9 mcsim 2>/dev/null || true
  sleep 0.25
  if open -a "$sim" "$so" 2>/dev/null; then
    return 0
  fi
  sleep 0.5
  if open -a "$sim" "$so" 2>/dev/null; then
    return 0
  fi
  log_warn "open -a mcsim 失败，改为直接启动二进制"
  ("$sim/Contents/MacOS/main" "$so" >/dev/null 2>&1 &)
}

cmd_ts_sim() {
  local id want=0
  id="$(require_fw "${1:-}")"
  [ -n "$id" ] || return 0
  if fw_needs_bank "$id"; then
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
  # Build only, then launch ourselves — avoids make's quit→open race (-600).
  (cd "$FW_ROOT/$id" && mcconfig "${mc_args[@]}" -t build) || return $?
  launch_mcsim "$id"
}

need_idf() {
  export IDF_GITHUB_ASSETS="${IDF_GITHUB_ASSETS:-dl.espressif.com/github_assets}"
  if [ -z "${IDF_PATH:-}" ] || [ ! -f "${IDF_PATH}/export.sh" ]; then
    export IDF_PATH="${HOME}/esp32/esp-idf-v6.1"
  fi
  [ -f "$IDF_PATH/export.sh" ] || log_die "缺少 ESP-IDF：${IDF_PATH}（安装未完成）"
  [ -d "$HOME/.espressif/tools/xtensa-esp-elf" ] || log_die "Espressif 工具未装完（缺 xtensa-esp-elf）。等 install 结束后再试"
  [ -d "$HOME/.espressif/tools/riscv32-esp-elf" ] || log_die "Espressif 工具未装完（缺 riscv32-esp-elf）。等 install 结束后再试"
  ls -d "$HOME/.espressif/python_env"/idf* >/dev/null 2>&1 || log_die "IDF python_env 未就绪。等 install-python-env 结束后再试"
  if [ -z "${CADV_IDF_READY:-}" ]; then
    # Prefer brew python@3.12 only before export — system/homebrew python3 may be 3.14.
    # Re-prepending after export.sh would hide the IDF venv and break idf.py (no rich_click).
    export PATH="/opt/homebrew/opt/python@3.12/libexec/bin:/opt/homebrew/opt/python@3.12/bin:$PATH"
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
  if fw_needs_bank "$id"; then
    want=1
  fi
  refresh_generated "$want"
  need_moddable
  need_idf
  check_piu_lists "$id" || log_die "Piu commandList 检查未过：$id"
  local wifi_args=() line
  if [ -f "$FW_ROOT/$id/wifi.local.json.example" ]; then
    while IFS= read -r line; do
      [ -n "$line" ] && wifi_args+=("$line")
    done < <(ts_wifi_args "$id")
  fi
  # Release, not -dn. Debug images own USB for xsbug, so the clock never
  # paints and a port open is read as "restart" — the launcher's "校验…" stays up and flashes.
  ESP_MC=(-m -p esp32/esp32s3_cdc)
  if [ "${#wifi_args[@]}" -gt 0 ]; then
    (cd "$FW_ROOT/$id" && mcconfig "${ESP_MC[@]}" -t build "${wifi_args[@]}")
  else
    (cd "$FW_ROOT/$id" && mcconfig "${ESP_MC[@]}" -t build)
  fi
}

# Release launcher stays in idf.py monitor after a good flash. The last boot
# line is "sd cadv N images". The monitor then holds the USB port, so the
# menu never returns and a later upload cannot open the port.
flash_log_booted() {
  [ -f "${1:-}" ] || return 1
  grep -qE 'sd cadv [0-9]+ images|sd mount:|sd scan:|sd cadv:' "$1"
}

flash_log_verified() {
  [ -f "${1:-}" ] || return 1
  grep -qE 'Hash of data verified|Hard resetting via RTS pin' "$1"
}

is_flash_monitor_cmd() {
  case "$1" in
    *do.sh*) return 1 ;;
    *esp_idf_monitor*|*idf_monitor.py*|*idf-monitor*|*idf.py*monitor*) return 0 ;;
  esac
  return 1
}

kill_idf_monitor() {
  local pid cmd killed=1
  while read -r pid cmd; do
    [ -n "${pid:-}" ] || continue
    if is_flash_monitor_cmd "$cmd"; then
      kill -TERM "$pid" 2>/dev/null || true
      killed=0
    fi
  done < <(ps -axww -o pid=,command=)
  return "$killed"
}

release_flash_watch() {
  local log="$1" reset_at=0 now
  while true; do
    if flash_log_booted "$log"; then
      sleep 0.2
      if kill_idf_monitor; then
        return 0
      fi
    elif flash_log_verified "$log"; then
      now=$(date +%s)
      if [ "$reset_at" -eq 0 ]; then
        reset_at=$now
      elif [ $((now - reset_at)) -ge 15 ]; then
        if kill_idf_monitor; then
          return 0
        fi
      fi
    fi
    sleep 0.4
  done
}

cmd_ts_flash() {
  local id want=0
  # The chip only holds the launcher. Other firmware is chosen on the device.
  id="${1:-sd}"
  fw_exists "$id" || log_die "没有固件：$id（可选：$(fw_ids | tr '\n' ' ')）"
  if fw_needs_bank "$id"; then
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

  release_upload_port
  log_info "烧录 $(fw_label "$id")（${id}）到 esp32/esp32s3_cdc"
  esp_mc "$id"
  # -dn builds a debug image but does not launch xsbug. serial2xsbug then
  # exits non-zero after a successful flash. esptool 4 prints "Hash of data
  # verified"; esptool 5 prints "verified" and "Hard resetting via RTS pin".
  # The launcher is not a debug image: its USB port carries file uploads.
  # A release build still stays in idf.py monitor after reset, stopped on
  # "sd cadv N images", so the menu cannot return. release_flash_watch ends
  # that monitor. bash 3.2 + set -u: empty "${arr[@]}" is unbound — branch.
  local log rc watch_pid=""
  log="$(mktemp "${TMPDIR:-/tmp}/cadv-flash.XXXXXX")"
  if [ "$id" = "sd" ]; then
    release_flash_watch "$log" &
    watch_pid=$!
  fi
  set +e
  set +o pipefail
  if [ "${#wifi_args[@]}" -gt 0 ]; then
    (cd "$FW_ROOT/$id" && mcconfig "${ESP_MC[@]}" "${wifi_args[@]}") 2>&1 | tee "$log"
  else
    (cd "$FW_ROOT/$id" && mcconfig "${ESP_MC[@]}") 2>&1 | tee "$log"
  fi
  rc=${PIPESTATUS[0]}
  if [ -n "$watch_pid" ]; then
    kill "$watch_pid" 2>/dev/null || true
    wait "$watch_pid" 2>/dev/null || true
  fi
  set -o pipefail
  set -e
  if [ "$rc" -ne 0 ] && flash_log_verified "$log"; then
    if [ "$id" != "sd" ]; then
      log_warn "xsbug 没开，调试器连接失败。固件已经写入。"
    fi
    rc=0
  fi
  rm -f "$log"
  if [ "$rc" -ne 0 ]; then
    # ${rc}: bash 3.2 treats $rc（ as a multi-byte var name
    log_die "mcconfig 退出码 ${rc}"
  fi
  log_success "已烧录 $(fw_label "$id")。板子按 RESET。"
  if [ "$id" = "sd" ]; then
    log_info "上传固件可以不拔卡：USB 接着，等基座菜单出来，再选上传。"
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
    port) cmd_port "$@" ;;
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
      "flash:烧录基座" \
      "sim:桌面模拟" \
      "sd:SD 卡（列出 / 上传 / 删除）" \
      "ts-check:检查 Moddable / TS / Piu lists" \
      "gen-font:生成 UI BMFont" \
      "gen-words:从 alice/data 生成词库" \
      "port:列出串口" \
      "port-free:释放串口占用" \
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
      port-free)
        (run port free) || log_error "执行失败（port free）"
        pause_menu
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

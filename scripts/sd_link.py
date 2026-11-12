#!/usr/bin/env python3
"""Talk to the Cardputer launcher over USB and write files into cadv/.

Frame, little endian, same as fw/base/link.c:
  u32 magic 'CADV' | u8 op | u8 status | u32 length | payload | u32 crc32
crc32 is zlib's, covering the bytes from op through the payload.

Protocol 3 (launcher reports it in PING): DATA frames are pipelined, WINDOW in
flight, and OP_SUM gives size + crc32 of a card file, so `put` skips files that
are already there. Older launchers get one frame at a time and no skip.
CADV_SD_FORCE=1 uploads every file anyway.
"""

from __future__ import annotations

import hashlib
import os
import struct
import sys
import time
import zlib

MAGIC = 0x56444143
MAX_PAYLOAD = 4096
MAX_NAME = 80

OP_PING = 1
OP_LIST = 2
OP_PUT = 3
OP_DATA = 4
OP_END = 5
OP_ABORT = 6
OP_RM = 7
OP_SUM = 8

ST_OK = 0
ST_BUSY = 1
ST_NOCARD = 2
ST_BADNAME = 3
ST_IO = 4
ST_CRC = 5
ST_NOFILE = 6
ST_BAD = 7

CHUNK = 4096
# Frames in flight. The launcher's USB driver buffers 16 KB; keep under it.
WINDOW = 3


class LinkError(Exception):
    pass


def crc32_update(crc: int, data: bytes) -> int:
    """Same bit loop as fw/base/link.c. Matches zlib.crc32."""
    crc = (~crc) & 0xFFFFFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            mask = -(crc & 1) & 0xFFFFFFFF
            crc = ((crc >> 1) ^ (0xEDB88320 & mask)) & 0xFFFFFFFF
    return (~crc) & 0xFFFFFFFF


def pack_frame(op: int, status: int, payload: bytes) -> bytes:
    if len(payload) > MAX_PAYLOAD:
        raise LinkError("一帧装不下")
    head = struct.pack("<IBBI", MAGIC, op, status, len(payload))
    crc = zlib.crc32(head[4:], 0) & 0xFFFFFFFF
    crc = zlib.crc32(payload, crc) & 0xFFFFFFFF
    return head + payload + struct.pack("<I", crc)


def try_parse(buf: bytearray):
    """Return (op, status, payload, end) or None if a frame is still incomplete.

    Skips a leading byte when it cannot start a valid frame.
    """
    while len(buf) >= 10:
        magic, op, status, length = struct.unpack_from("<IBBI", buf, 0)
        if magic != MAGIC or length > MAX_PAYLOAD:
            del buf[0]
            continue
        total = 14 + length
        if len(buf) < total:
            return None
        body = bytes(buf[4:10 + length])
        expect = struct.unpack_from("<I", buf, 10 + length)[0]
        got = zlib.crc32(body, 0) & 0xFFFFFFFF
        if expect != got:
            del buf[0]
            continue
        payload = bytes(buf[10:10 + length])
        del buf[:total]
        return op, status, payload
    return None


def status_error(status: int, name: str, rm: bool = False) -> LinkError:
    if status == ST_BUSY:
        return LinkError("设备正在把固件载入芯片，等它重启后再传。")
    if status == ST_NOCARD:
        return LinkError("板子读不到 SD 卡。确认卡已插好，并且是 FAT 或 exFAT。")
    if status == ST_BADNAME:
        return LinkError(f"文件名不能用：{name}")
    if status == ST_IO:
        if rm:
            return LinkError(f"删除失败：{name or 'cadv'}")
        return LinkError(f"写入失败：{name or 'cadv'}")
    if status == ST_CRC:
        return LinkError(f"校验失败：{name}")
    if status == ST_NOFILE:
        if rm:
            return LinkError(f"没有这个文件：{name}")
        return LinkError("传输中断了。再传一次。")
    if status == ST_BAD:
        return LinkError("基座不认识这个命令。先 ./do.sh flash 再上传。")
    return LinkError(f"设备拒绝了这次传输（{status}）")


def open_port(path: str):
    try:
        import serial
    except ImportError as exc:
        raise LinkError("没有 pyserial。ESP-IDF 的 Python 环境里有，或 pip install pyserial") from exc
    ser = serial.Serial(
        baudrate=115200,
        timeout=0.02,
        write_timeout=5,
        dsrdtr=False,
        rtscts=False,
        exclusive=True,
    )
    # USB Serial/JTAG resets the chip when RTS is high and DTR low. macOS
    # raises both on open, so clearing DTR first passed through that state:
    # every open rebooted the launcher and the first reply took ~2.8 s.
    # Keep DTR high and drop RTS only: the reset state never appears.
    ser.dtr = True
    ser.rts = False
    ser.port = path
    try:
        ser.open()
    except Exception as exc:
        raise LinkError(f"打不开串口 {path}：{exc}。可能被别的程序占用。") from exc
    ser.dtr = True
    ser.rts = False
    time.sleep(0.02)
    ser.reset_input_buffer()
    return ser


def write_all(ser, data: bytes) -> None:
    view = memoryview(data)
    off = 0
    while off < len(view):
        n = ser.write(view[off:])
        if not n:
            raise LinkError("串口写不出去")
        off += n
    ser.flush()


NO_ANSWER = "基座没有应答。卡留在板子上，先 ./do.sh flash，按 RESET，等菜单出来再上传。"


class Link:
    """Port plus the bytes read past the last reply (pipelined replies)."""

    def __init__(self, ser):
        self.ser = ser
        self.buf = bytearray()
        self.version = 1

    def send(self, op: int, payload: bytes) -> None:
        write_all(self.ser, pack_frame(op, 0, payload))

    def reply(self, expect_op: int, timeout: float):
        deadline = time.monotonic() + timeout
        while True:
            parsed = try_parse(self.buf)
            while parsed is not None:
                op, status, payload = parsed
                if op == expect_op:
                    return status, payload
                parsed = try_parse(self.buf)
            if time.monotonic() >= deadline:
                raise LinkError(NO_ANSWER)
            chunk = self.ser.read(self.ser.in_waiting or 1)
            if chunk:
                self.buf += chunk

    def call(self, op: int, payload: bytes, timeout: float, name: str = "", rm: bool = False):
        self.send(op, payload)
        status, body = self.reply(op, timeout)
        if status != ST_OK:
            raise status_error(status, name, rm)
        return body

    def close(self) -> None:
        self.ser.close()


def connect(port: str) -> Link:
    link = Link(open_port(port))
    try:
        link.version = ping(link)
    except BaseException:
        link.close()
        raise
    return link


def ping(link: Link) -> int:
    deadline = time.monotonic() + 8
    last = LinkError(NO_ANSWER)
    while time.monotonic() < deadline:
        try:
            body = link.call(OP_PING, b"", 0.5)
        except LinkError as exc:
            last = exc
            if "没有应答" not in str(exc):
                raise
            continue
        if len(body) != 1 or body[0] < 1:
            raise LinkError("基座协议版本不对。先 ./do.sh flash 再上传。")
        return body[0]
    raise last


def parse_list(payload: bytes):
    items = []
    i = 0
    while i < len(payload):
        if i + 1 > len(payload):
            raise LinkError("列表损坏")
        n = payload[i]
        i += 1
        if n == 0 or i + n + 4 > len(payload):
            raise LinkError("列表损坏")
        name = payload[i:i + n].decode("utf-8", "replace")
        i += n
        size = struct.unpack_from("<I", payload, i)[0]
        i += 4
        items.append((size, name))
    return items


def human(n: float) -> str:
    if n < 1024:
        return f"{int(n)} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n / 1024 / 1024:.1f} MB"


def human_time(sec: float) -> str:
    if sec < 60:
        return f"{sec:.1f} s"
    return f"{int(sec // 60)} 分 {int(sec % 60)} 秒"


class Progress:
    """One live line on a terminal; sparse plain lines when piped."""

    BAR = 20

    def __init__(self, files: int, total: int):
        self.tty = sys.stderr.isatty()
        self.files = files
        self.total = total
        self.done = 0
        self.index = 0
        self.name = ""
        self.start = time.monotonic()
        self.last_draw = 0.0

    def begin(self, index: int, name: str) -> None:
        self.index = index
        self.name = name

    def rate(self) -> float:
        sec = time.monotonic() - self.start
        return self.done / sec if sec > 0.2 else 0.0

    def add(self, n: int) -> None:
        self.done += n
        # Piped output (logs, CI) gets only the per-file lines and the summary.
        if not self.tty:
            return
        now = time.monotonic()
        if now - self.last_draw < 0.08 and self.done < self.total:
            return
        self.last_draw = now
        self.draw()

    def draw(self) -> None:
        frac = self.done / self.total if self.total else 1.0
        fill = int(frac * self.BAR)
        bar = "█" * fill + "░" * (self.BAR - fill)
        rate = self.rate()
        eta = ""
        if rate > 0 and self.done < self.total:
            eta = f"  剩 {human_time((self.total - self.done) / rate)}"
        line = (f"  {bar} {frac * 100:5.1f}%  {human(self.done)}/{human(self.total)}"
                f"  {human(rate)}/s{eta}  [{self.index}/{self.files}] {self.name}")
        print("\r\033[K" + line, file=sys.stderr, end="", flush=True)

    def clear(self) -> None:
        if self.tty:
            print("\r\033[K", file=sys.stderr, end="", flush=True)

    def say(self, text: str) -> None:
        self.clear()
        print(text, file=sys.stderr, flush=True)
        if self.tty and self.done < self.total:
            self.draw()


def put_one(link: Link, src: str, dest: str, size: int, prog: Progress) -> None:
    raw = dest.encode("utf-8")
    payload = bytes([len(raw)]) + raw + struct.pack("<I", size)
    window = WINDOW if link.version >= 3 else 1
    try:
        link.call(OP_PUT, payload, 15, dest)
        crc = 0
        pending = 0
        with open(src, "rb") as fh:
            while True:
                chunk = fh.read(CHUNK)
                if not chunk:
                    break
                link.send(OP_DATA, chunk)
                pending += 1
                crc = zlib.crc32(chunk, crc) & 0xFFFFFFFF
                prog.add(len(chunk))
                if pending >= window:
                    status, _ = link.reply(OP_DATA, 15)
                    pending -= 1
                    if status != ST_OK:
                        raise status_error(status, dest)
        while pending:
            status, _ = link.reply(OP_DATA, 15)
            pending -= 1
            if status != ST_OK:
                raise status_error(status, dest)
        link.call(OP_END, struct.pack("<I", crc), 15, dest)
    except LinkError:
        try:
            # Drop replies still in flight, then tell the launcher to give up.
            time.sleep(0.2)
            link.ser.reset_input_buffer()
            link.buf.clear()
            link.call(OP_ABORT, b"", 2, dest)
        except LinkError:
            pass
        raise


def image_tail(path: str, size: int):
    """Offset of the SHA-256 an ESP app image carries at its end, or 0.

    Equal size and equal trailing digest mean equal images, so the launcher
    reads 32 bytes instead of the whole file (~0.7 s per MB on the card).
    """
    if size < 64:
        return 0
    with open(path, "rb") as fh:
        head = fh.read(24)
        if len(head) < 24 or head[0] != 0xE9 or head[23] != 1:
            return 0
        h = hashlib.sha256(head)
        left = size - 32 - len(head)
        while left:
            chunk = fh.read(min(left, 1 << 16))
            if not chunk:
                return 0
            h.update(chunk)
            left -= len(chunk)
        if fh.read(32) != h.digest():
            return 0
    return size - 32


def file_crc(path: str, offset: int = 0) -> int:
    crc = 0
    with open(path, "rb") as fh:
        fh.seek(offset)
        while True:
            chunk = fh.read(1 << 16)
            if not chunk:
                return crc
            crc = zlib.crc32(chunk, crc) & 0xFFFFFFFF


def card_sum(link: Link, dest: str, offset: int = 0):
    """(size, crc from offset) of cadv/<dest>, or None when it is not there."""
    raw = dest.encode("utf-8")
    extra = struct.pack("<I", offset) if offset else b""
    link.send(OP_SUM, bytes([len(raw)]) + raw + extra)
    status, body = link.reply(OP_SUM, 30)
    if status == ST_NOFILE:
        return None
    if status != ST_OK or len(body) != 8:
        raise status_error(status, dest)
    return struct.unpack("<II", body)


def name_ok(raw: bytes) -> bool:
    if not raw or len(raw) > MAX_NAME or raw.startswith(b"/") or raw.endswith(b"/"):
        return False
    start = 0
    for i, byte in enumerate(raw + b"/"):
        if byte == 0x5C or byte < 0x20 or byte == 0x7F:
            return False
        if byte != 0x2F:
            continue
        part = raw[start:i]
        if not part or len(part) > 64 or part[:1] == b".":
            return False
        start = i + 1
    return True


def cmd_ping(port: str) -> None:
    connect(port).close()


def cmd_ls(port: str) -> None:
    link = connect(port)
    try:
        body = link.call(OP_LIST, b"", 15, "cadv")
        for size, name in parse_list(body):
            print(f"{size}\t{name}")
    finally:
        link.close()


def rm_one(link: Link, dest: str) -> None:
    raw = dest.encode("utf-8")
    if not name_ok(raw):
        raise LinkError(f"文件名不能用：{dest}")
    payload = bytes([len(raw)]) + raw
    link.call(OP_RM, payload, 15, dest, True)


def cmd_rm(port: str, names: list[str]) -> None:
    if not names:
        raise LinkError("没有要删除的文件")
    link = connect(port)
    try:
        if link.version < 2:
            raise LinkError("基座还不支持删除。先 ./do.sh flash，再删。")
        for name in names:
            rm_one(link, name)
    finally:
        link.close()


def cmd_put(port: str, pairs: list[tuple[str, str]]) -> None:
    if not pairs:
        raise LinkError("没有要上传的文件")
    files = []
    for src, dest in pairs:
        if not os.path.isfile(src):
            raise LinkError(f"没有这个文件：{src}")
        size = os.path.getsize(src)
        if size > 0xFFFFFFFF:
            raise LinkError(f"文件太大：{dest}")
        if not name_ok(dest.encode("utf-8")):
            raise LinkError(f"文件名不能用：{dest}")
        files.append((src, dest, size))
    force = os.environ.get("CADV_SD_FORCE", "") not in ("", "0")
    link = connect(port)
    try:
        if link.version < 3:
            print(f"  基座协议 v{link.version}：逐块等应答，也不能跳过未变的文件。./do.sh flash 后上传更快",
                  file=sys.stderr)
        # Skip files whose size and crc already match. LIST first: SUM only
        # where the size matches, since reading a card file costs time too.
        skipped = []
        todo = files
        if link.version >= 3 and not force:
            on_card = {name: size for size, name in parse_list(link.call(OP_LIST, b"", 15, "cadv"))}
            todo = []
            for src, dest, size in files:
                if on_card.get(dest) == size:
                    offset = image_tail(src, size)
                    got = card_sum(link, dest, offset)
                    if got is not None and got == (size, file_crc(src, offset)):
                        skipped.append((src, dest, size))
                        continue
                todo.append((src, dest, size))
        total = sum(f[2] for f in todo)
        prog = Progress(len(todo), total)
        for i, (src, dest, size) in enumerate(todo, 1):
            prog.begin(i, dest)
            t0 = time.monotonic()
            put_one(link, src, dest, size, prog)
            sec = time.monotonic() - t0
            # Labels and icons are tiny; the summary counts them.
            if size >= 16 * 1024:
                rate = f"{human(size / sec)}/s" if sec > 0 else ""
                prog.say(f"  ✓ {dest:<20} {human(size):>8}  {human_time(sec):>7}  {rate}")
        prog.clear()
        sec = time.monotonic() - prog.start
        parts = []
        if todo:
            rate = f"，{human(total / sec)}/s" if sec > 0 else ""
            parts.append(f"写入 {len(todo)} 个文件 {human(total)}，用时 {human_time(sec)}{rate}")
        else:
            parts.append("没有要写的文件")
        if skipped:
            parts.append(f"{len(skipped)} 个和卡上相同，已跳过（CADV_SD_FORCE=1 强制重传）")
        print("  " + "；".join(parts), file=sys.stderr)
    finally:
        link.close()


def selftest() -> None:
    vector = b"123456789"
    expect = 0xCBF43926
    if zlib.crc32(vector) & 0xFFFFFFFF != expect:
        raise SystemExit("zlib crc 向量不对")
    if crc32_update(0, vector) != expect:
        raise SystemExit("crc 循环和 zlib 不一致")
    acc = 0
    for i in range(0, len(vector), 3):
        acc = crc32_update(acc, vector[i:i + 3])
    if acc != expect:
        raise SystemExit("crc 分段不一致")

    payload = b"clock.bin"
    frame = pack_frame(OP_PING, 0, payload)
    buf = bytearray(b"\x00\xff" + frame + pack_frame(OP_LIST, 0, b""))
    first = try_parse(buf)
    if first != (OP_PING, 0, payload):
        raise SystemExit(f"解析失败：{first!r}")
    second = try_parse(buf)
    if second != (OP_LIST, 0, b""):
        raise SystemExit(f"第二帧失败：{second!r}")
    if buf:
        raise SystemExit("解析后还有剩余")

    bad = bytearray(frame)
    bad[-1] ^= 0xFF
    if try_parse(bad) is not None:
        raise SystemExit("坏校验应该被丢掉")

    rm_payload = bytes([8]) + b"clock.bin"
    rm_frame = pack_frame(OP_RM, 0, rm_payload)
    rm_buf = bytearray(rm_frame)
    rm_got = try_parse(rm_buf)
    if rm_got != (OP_RM, 0, rm_payload) or rm_buf:
        raise SystemExit(f"删除帧失败：{rm_got!r} {rm_buf!r}")

    listed = parse_list(bytes([5]) + b"a.bin" + struct.pack("<I", 12) + bytes([1]) + b"b" + struct.pack("<I", 0))
    if listed != [(12, "a.bin"), (0, "b")]:
        raise SystemExit(f"列表解析失败：{listed!r}")
    if not name_ok(b"clock.bin") or not name_ok("子/a.txt".encode()):
        raise SystemExit("合法名字被拒绝")
    for bad_name in (b"", b"/a", b"a/", b"..", b"a/../b", b"a//b", b".hidden"):
        if name_ok(bad_name):
            raise SystemExit(f"不该接受：{bad_name!r}")
    print("sd_link selftest ok")


def usage() -> None:
    print(
        "用法：sd_link.py selftest | ping PORT | ls PORT | rm PORT NAME... | put PORT SRC DEST [SRC DEST...]",
        file=sys.stderr,
    )


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        usage()
        return 2
    cmd = argv[1]
    try:
        if cmd == "selftest":
            selftest()
        elif cmd == "ping" and len(argv) == 3:
            cmd_ping(argv[2])
        elif cmd == "ls" and len(argv) == 3:
            cmd_ls(argv[2])
        elif cmd == "rm" and len(argv) >= 4:
            cmd_rm(argv[2], argv[3:])
        elif cmd == "put" and len(argv) >= 5 and (len(argv) - 3) % 2 == 0:
            pairs = []
            args = argv[3:]
            for i in range(0, len(args), 2):
                pairs.append((args[i], args[i + 1]))
            cmd_put(argv[2], pairs)
        else:
            usage()
            return 2
    except LinkError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("已取消", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

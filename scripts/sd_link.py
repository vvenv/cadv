#!/usr/bin/env python3
"""Talk to the Cardputer launcher over USB and write files into cadv/.

Frame, little endian, same as fw/sd/link.c:
  u32 magic 'CADV' | u8 op | u8 status | u32 length | payload | u32 crc32
crc32 is zlib's, covering the bytes from op through the payload.
"""

from __future__ import annotations

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

ST_OK = 0
ST_BUSY = 1
ST_NOCARD = 2
ST_BADNAME = 3
ST_IO = 4
ST_CRC = 5
ST_NOFILE = 6
ST_BAD = 7

CHUNK = 4096


class LinkError(Exception):
    pass


def crc32_update(crc: int, data: bytes) -> int:
    """Same bit loop as fw/sd/link.c. Matches zlib.crc32."""
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


def status_error(status: int, name: str) -> LinkError:
    if status == ST_BUSY:
        return LinkError("设备正在把固件载入芯片，等它重启后再传。")
    if status == ST_NOCARD:
        return LinkError("板子读不到 SD 卡。确认卡已插好，并且是 FAT 或 exFAT。")
    if status == ST_BADNAME:
        return LinkError(f"文件名不能用：{name}")
    if status == ST_IO:
        return LinkError(f"写入失败：{name or 'cadv'}")
    if status == ST_CRC:
        return LinkError(f"校验失败：{name}")
    if status == ST_NOFILE:
        return LinkError("传输中断了。再传一次。")
    if status == ST_BAD:
        return LinkError("启动器不认识这个命令。先 ./do.sh flash 再上传。")
    return LinkError(f"设备拒绝了这次传输（{status}）")


def open_port(path: str):
    try:
        import serial
    except ImportError as exc:
        raise LinkError("没有 pyserial。ESP-IDF 的 Python 环境里有，或 pip install pyserial") from exc
    ser = serial.Serial(
        baudrate=115200,
        timeout=0.05,
        write_timeout=5,
        dsrdtr=False,
        rtscts=False,
        exclusive=True,
    )
    # Leave DTR/RTS low before open. Asserting them resets the ESP32-S3.
    ser.dtr = False
    ser.rts = False
    ser.port = path
    try:
        ser.open()
    except Exception as exc:
        raise LinkError(f"打不开串口 {path}：{exc}。可能被别的程序占用。") from exc
    ser.dtr = False
    ser.rts = False
    time.sleep(0.05)
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


def read_reply(ser, expect_op: int, timeout: float):
    buf = bytearray()
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        waiting = ser.in_waiting or 1
        chunk = ser.read(waiting)
        if chunk:
            buf += chunk
            while True:
                parsed = try_parse(buf)
                if parsed is None:
                    break
                op, status, payload = parsed
                if op == expect_op:
                    return status, payload
        else:
            time.sleep(0.005)
    raise LinkError("启动器没有应答。卡留在板子上，先 ./do.sh flash，按 RESET，等菜单出来再上传。")


def transact(ser, op: int, payload: bytes, timeout: float, name: str = ""):
    write_all(ser, pack_frame(op, 0, payload))
    status, body = read_reply(ser, op, timeout)
    if status != ST_OK:
        raise status_error(status, name)
    return body


def ping(ser) -> None:
    deadline = time.monotonic() + 8
    last = LinkError("启动器没有应答。卡留在板子上，先 ./do.sh flash，按 RESET，等菜单出来再上传。")
    while time.monotonic() < deadline:
        try:
            body = transact(ser, OP_PING, b"", 0.5)
        except LinkError as exc:
            last = exc
            if "没有应答" not in str(exc):
                raise
            continue
        if body != b"\x01":
            raise LinkError("启动器协议版本不对。先 ./do.sh flash 再上传。")
        return
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


def show_progress(name: str, got: int, total: int, last: list[int]) -> None:
    pct = (got * 100 // total) if total else 100
    if pct == last[0] and got != total:
        return
    last[0] = pct
    line = f"{name}  {pct}%"
    if sys.stderr.isatty():
        print("\r" + line, file=sys.stderr, end="", flush=True)
    else:
        print(line, file=sys.stderr, flush=True)


def put_one(ser, src: str, dest: str) -> None:
    if not os.path.isfile(src):
        raise LinkError(f"没有这个文件：{src}")
    size = os.path.getsize(src)
    if size > 0xFFFFFFFF:
        raise LinkError(f"文件太大：{dest}")
    raw = dest.encode("utf-8")
    if not name_ok(raw):
        raise LinkError(f"文件名不能用：{dest}")
    payload = bytes([len(raw)]) + raw + struct.pack("<I", size)
    try:
        transact(ser, OP_PUT, payload, 15, dest)
        crc = 0
        got = 0
        last = [-1]
        with open(src, "rb") as fh:
            while True:
                chunk = fh.read(CHUNK)
                if not chunk:
                    break
                transact(ser, OP_DATA, chunk, 15, dest)
                crc = zlib.crc32(chunk, crc) & 0xFFFFFFFF
                got += len(chunk)
                show_progress(dest, got, size, last)
        transact(ser, OP_END, struct.pack("<I", crc), 15, dest)
    except LinkError:
        try:
            transact(ser, OP_ABORT, b"", 2, dest)
        except LinkError:
            pass
        raise
    if sys.stderr.isatty():
        print(file=sys.stderr)


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
    ser = open_port(port)
    try:
        ping(ser)
    finally:
        ser.close()


def cmd_ls(port: str) -> None:
    ser = open_port(port)
    try:
        ping(ser)
        body = transact(ser, OP_LIST, b"", 15, "cadv")
        for size, name in parse_list(body):
            print(f"{size}\t{name}")
    finally:
        ser.close()


def cmd_put(port: str, pairs: list[tuple[str, str]]) -> None:
    if not pairs:
        raise LinkError("没有要上传的文件")
    ser = open_port(port)
    try:
        ping(ser)
        for src, dest in pairs:
            put_one(ser, src, dest)
    finally:
        ser.close()


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
        "用法：sd_link.py selftest | ping PORT | ls PORT | put PORT SRC DEST [SRC DEST...]",
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

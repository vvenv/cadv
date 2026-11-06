/*
	USB serial link. The host sends files; this writes them under /sdcard/cadv.
	The launcher is built without the xsbug reader. That reader owns this port
	and would swallow the stream. Frame layout matches scripts/sd_link.py.

	Frame, little endian:
	  u32 magic 'CADV' | u8 op | u8 status | u32 length | payload | u32 crc32
	crc32 is zlib's, over op through payload.
*/

#include "xsmc.h"
#include "mc.defines.h"

#include "freertos/FreeRTOSConfig.h"
#include "freertos/portmacro.h"
#include "freertos/projdefs.h"

#include "driver/usb_serial_jtag.h"

#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef MODDEF_FILE_ROOT
	#define MODDEF_FILE_ROOT "/sdcard"
#endif

#define LINK_MAGIC 0x56444143u
#define LINK_MAX_PAYLOAD 4096
#define LINK_MAX_NAME 80

#define OP_PING 1
#define OP_LIST 2
#define OP_PUT 3
#define OP_DATA 4
#define OP_END 5
#define OP_ABORT 6

#define ST_OK 0
#define ST_BUSY 1
#define ST_NOCARD 2
#define ST_BADNAME 3
#define ST_IO 4
#define ST_CRC 5
#define ST_NOFILE 6
#define ST_BAD 7

static int gReady;
static int gBusy;
static int gFd = -1;
static uint32_t gExpect;
static uint32_t gGot;
static uint32_t gCrc;
static char gName[LINK_MAX_NAME + 1];
static char gFinal[192];
static char gPart[200];
static uint8_t gRx[LINK_MAX_PAYLOAD + 64];
static size_t gRxLen;
static uint8_t gTx[LINK_MAX_PAYLOAD + 16];
static uint8_t gList[LINK_MAX_PAYLOAD];
static char gUi[160];
static const char *gUiOut;

static uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t len)
{
	crc = ~crc;
	while (len--) {
		int b;
		crc ^= *data++;
		for (b = 0; b < 8; b++) {
			uint32_t mask = -(crc & 1u);
			crc = (crc >> 1) ^ (0xEDB88320u & mask);
		}
	}
	return ~crc;
}

static uint32_t get_u32(const uint8_t *p)
{
	return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

static void put_u32(uint8_t *p, uint32_t v)
{
	p[0] = (uint8_t)v;
	p[1] = (uint8_t)(v >> 8);
	p[2] = (uint8_t)(v >> 16);
	p[3] = (uint8_t)(v >> 24);
}

static void link_start(void)
{
	usb_serial_jtag_driver_config_t cfg = {
		.tx_buffer_size = 4096,
		.rx_buffer_size = 16384,
	};

	if (gReady)
		return;
	/* Debug builds install this driver for xsbug and consume every byte. */
	if (usb_serial_jtag_is_driver_installed())
		return;
	if (usb_serial_jtag_driver_install(&cfg) != ESP_OK)
		return;
	gReady = 1;
}

static void write_all(const uint8_t *data, size_t len)
{
	while (len) {
		int n = usb_serial_jtag_write_bytes(data, len, pdMS_TO_TICKS(500));
		if (n <= 0)
			return;
		data += n;
		len -= (size_t)n;
	}
}

static void reply(uint8_t op, uint8_t status, const uint8_t *payload, uint32_t len)
{
	uint32_t crc;

	if (len > LINK_MAX_PAYLOAD)
		len = LINK_MAX_PAYLOAD;
	put_u32(gTx, LINK_MAGIC);
	gTx[4] = op;
	gTx[5] = status;
	put_u32(gTx + 6, len);
	if (len && payload)
		memcpy(gTx + 10, payload, len);
	crc = crc32_update(0, gTx + 4, 6 + len);
	put_u32(gTx + 10 + len, crc);
	write_all(gTx, 14 + len);
}

static void ui_set(const char *text)
{
	gUiOut = text;
}

static void ui_recv(void)
{
	snprintf(gUi, sizeof(gUi), "recv\t%s\t%lu\t%lu", gName, (unsigned long)gGot, (unsigned long)gExpect);
	gUiOut = gUi;
}

static int card_ok(void)
{
	struct stat st;
	return stat(MODDEF_FILE_ROOT, &st) == 0 && S_ISDIR(st.st_mode);
}

static int ensure_dir(const char *path)
{
	struct stat st;
	if (stat(path, &st) == 0)
		return S_ISDIR(st.st_mode) ? 0 : -1;
	if (mkdir(path, 0777) == 0 || errno == EEXIST)
		return 0;
	return -1;
}

static void close_part(int keep)
{
	if (gFd >= 0) {
		close(gFd);
		gFd = -1;
	}
	if (!keep && gPart[0])
		unlink(gPart);
	if (!keep) {
		gPart[0] = 0;
		gFinal[0] = 0;
		gExpect = 0;
		gGot = 0;
		gCrc = 0;
	}
}

static int name_ok(const uint8_t *name, size_t n)
{
	size_t i, start;

	if (n == 0 || n > LINK_MAX_NAME)
		return 0;
	if (name[0] == '/' || name[n - 1] == '/')
		return 0;
	start = 0;
	for (i = 0; i <= n; i++) {
		int at_end = (i == n);
		unsigned char c = at_end ? (unsigned char)'/' : name[i];
		size_t len;

		if (!at_end && (c == '\\' || c < 0x20 || c == 0x7f))
			return 0;
		if (c != '/')
			continue;
		len = i - start;
		if (len == 0 || len > 64 || name[start] == '.')
			return 0;
		start = i + 1;
	}
	return 1;
}

static int ensure_parents(char *full)
{
	char *last = strrchr(full, '/');
	char *p;

	if (!last || last == full)
		return -1;
	*last = 0;
	for (p = full + 1; *p; p++) {
		if (*p != '/')
			continue;
		*p = 0;
		if (ensure_dir(full)) {
			*p = '/';
			*last = '/';
			return -1;
		}
		*p = '/';
	}
	if (ensure_dir(full)) {
		*last = '/';
		return -1;
	}
	*last = '/';
	return 0;
}

static int write_full(const uint8_t *data, size_t len)
{
	while (len) {
		ssize_t n = write(gFd, data, len);
		if (n < 0) {
			if (errno == EINTR)
				continue;
			return -1;
		}
		if (n == 0)
			return -1;
		data += n;
		len -= (size_t)n;
	}
	return 0;
}

static int ends_with(const char *s, const char *suf)
{
	size_t n = strlen(s);
	size_t m = strlen(suf);
	return n >= m && memcmp(s + n - m, suf, m) == 0;
}

static int append_entry(uint32_t *used, const char *rel, uint32_t size)
{
	size_t n = strlen(rel);

	if (n == 0 || n > 255)
		return 0;
	if (*used + 1 + n + 4 > LINK_MAX_PAYLOAD)
		return -1;
	gList[(*used)++] = (uint8_t)n;
	memcpy(gList + *used, rel, n);
	*used += (uint32_t)n;
	gList[(*used)++] = (uint8_t)size;
	gList[(*used)++] = (uint8_t)(size >> 8);
	gList[(*used)++] = (uint8_t)(size >> 16);
	gList[(*used)++] = (uint8_t)(size >> 24);
	return 0;
}

static int walk(const char *dir, const char *rel, uint32_t *used, int depth, int *trunc)
{
	DIR *d = opendir(dir);
	struct dirent *ent;

	if (!d)
		return 0;
	while ((ent = readdir(d)) != NULL) {
		char path[128];
		char child[LINK_MAX_NAME + 1];
		struct stat st;
		size_t dlen = strlen(ent->d_name);
		size_t rlen = strlen(rel);

		if (dlen == 0 || ent->d_name[0] == '.')
			continue;
		if (rlen + (rlen ? 1 : 0) + dlen > LINK_MAX_NAME)
			continue;
		if (rlen) {
			memcpy(child, rel, rlen);
			child[rlen] = '/';
			memcpy(child + rlen + 1, ent->d_name, dlen + 1);
		}
		else
			memcpy(child, ent->d_name, dlen + 1);
		if (ends_with(child, ".part"))
			continue;
		snprintf(path, sizeof(path), "%s/%s", dir, ent->d_name);
		if (stat(path, &st) != 0)
			continue;
		if (S_ISDIR(st.st_mode)) {
			if (depth > 0)
				walk(path, child, used, depth - 1, trunc);
			if (*trunc)
				break;
			continue;
		}
		if (!S_ISREG(st.st_mode))
			continue;
		if (!name_ok((const uint8_t *)child, strlen(child)))
			continue;
		if (st.st_size < 0 || (uint64_t)st.st_size > 0xffffffffu)
			continue;
		if (append_entry(used, child, (uint32_t)st.st_size) != 0) {
			*trunc = 1;
			break;
		}
	}
	closedir(d);
	return 0;
}

static void on_ping(void)
{
	uint8_t ver = 1;
	reply(OP_PING, ST_OK, &ver, 1);
}

static void on_list(void)
{
	char home[64];
	struct stat st;
	uint32_t used = 0;
	int trunc = 0;

	if (!card_ok()) {
		reply(OP_LIST, ST_NOCARD, NULL, 0);
		return;
	}
	snprintf(home, sizeof(home), "%s/cadv", MODDEF_FILE_ROOT);
	if (stat(home, &st) != 0) {
		reply(OP_LIST, ST_OK, NULL, 0);
		return;
	}
	walk(home, "", &used, 4, &trunc);
	if (trunc) {
		reply(OP_LIST, ST_IO, NULL, 0);
		return;
	}
	reply(OP_LIST, ST_OK, used ? gList : NULL, used);
}

static void on_put(const uint8_t *payload, uint32_t len)
{
	uint8_t name_len;
	uint32_t size;
	char tmp[192];

	if (gBusy) {
		close_part(0);
		reply(OP_PUT, ST_BUSY, NULL, 0);
		ui_set("err\tbusy");
		return;
	}
	if (!card_ok()) {
		reply(OP_PUT, ST_NOCARD, NULL, 0);
		ui_set("err\tnocard");
		return;
	}
	if (len < 5) {
		reply(OP_PUT, ST_BADNAME, NULL, 0);
		ui_set("err\tname");
		return;
	}
	name_len = payload[0];
	if ((uint32_t)name_len + 5 != len || !name_ok(payload + 1, name_len)) {
		reply(OP_PUT, ST_BADNAME, NULL, 0);
		ui_set("err\tname");
		return;
	}
	size = get_u32(payload + 1 + name_len);
	close_part(0);
	memcpy(gName, payload + 1, name_len);
	gName[name_len] = 0;
	snprintf(gFinal, sizeof(gFinal), "%s/cadv/%s", MODDEF_FILE_ROOT, gName);
	snprintf(gPart, sizeof(gPart), "%s.part", gFinal);
	snprintf(tmp, sizeof(tmp), "%s", gFinal);
	if (ensure_parents(tmp)) {
		gPart[0] = 0;
		reply(OP_PUT, ST_IO, NULL, 0);
		ui_set("err\tio");
		return;
	}
	gFd = open(gPart, O_WRONLY | O_CREAT | O_TRUNC, 0666);
	if (gFd < 0) {
		gPart[0] = 0;
		reply(OP_PUT, ST_IO, NULL, 0);
		ui_set("err\tio");
		return;
	}
	gExpect = size;
	gGot = 0;
	gCrc = 0;
	reply(OP_PUT, ST_OK, NULL, 0);
	ui_recv();
}

static void on_data(const uint8_t *payload, uint32_t len)
{
	if (gBusy) {
		close_part(0);
		reply(OP_DATA, ST_BUSY, NULL, 0);
		ui_set("err\tbusy");
		return;
	}
	if (gFd < 0) {
		reply(OP_DATA, ST_NOFILE, NULL, 0);
		ui_set("err\tnofile");
		return;
	}
	if ((uint64_t)gGot + len > gExpect || write_full(payload, len)) {
		close_part(0);
		reply(OP_DATA, ST_IO, NULL, 0);
		ui_set("err\tio");
		return;
	}
	gCrc = crc32_update(gCrc, payload, len);
	gGot += len;
	reply(OP_DATA, ST_OK, NULL, 0);
	ui_recv();
}

static void on_end(const uint8_t *payload, uint32_t len)
{
	uint32_t want;

	if (gBusy) {
		close_part(0);
		reply(OP_END, ST_BUSY, NULL, 0);
		ui_set("err\tbusy");
		return;
	}
	if (gFd < 0) {
		reply(OP_END, ST_NOFILE, NULL, 0);
		ui_set("err\tnofile");
		return;
	}
	if (len != 4) {
		close_part(0);
		reply(OP_END, ST_CRC, NULL, 0);
		ui_set("err\tcrc");
		return;
	}
	want = get_u32(payload);
	if (gGot != gExpect || want != gCrc) {
		close_part(0);
		reply(OP_END, ST_CRC, NULL, 0);
		ui_set("err\tcrc");
		return;
	}
	if (fsync(gFd) != 0) {
		close_part(0);
		reply(OP_END, ST_IO, NULL, 0);
		ui_set("err\tio");
		return;
	}
	close(gFd);
	gFd = -1;
	unlink(gFinal);
	if (rename(gPart, gFinal) != 0) {
		unlink(gPart);
		gPart[0] = 0;
		reply(OP_END, ST_IO, NULL, 0);
		ui_set("err\tio");
		return;
	}
	gPart[0] = 0;
	reply(OP_END, ST_OK, NULL, 0);
	snprintf(gUi, sizeof(gUi), "done\t%s", gName);
	gUiOut = gUi;
}

static void on_abort(void)
{
	close_part(0);
	reply(OP_ABORT, ST_OK, NULL, 0);
}

static void handle(uint8_t op, uint8_t status, const uint8_t *payload, uint32_t len)
{
	if (status != 0) {
		reply(op, ST_BAD, NULL, 0);
		return;
	}
	switch (op) {
		case OP_PING: on_ping(); break;
		case OP_LIST: on_list(); break;
		case OP_PUT: on_put(payload, len); break;
		case OP_DATA: on_data(payload, len); break;
		case OP_END: on_end(payload, len); break;
		case OP_ABORT: on_abort(); break;
		default:
			reply(op, ST_BAD, NULL, 0);
			break;
	}
}

/* One frame per call so the screen can update between chunks. */
static int pull_frame(void)
{
	uint8_t tmp[512];

	if (!gReady)
		return 0;
	for (;;) {
		int n = usb_serial_jtag_read_bytes(tmp, sizeof(tmp), 0);
		if (n <= 0)
			break;
		if (gRxLen + (size_t)n > sizeof(gRx))
			gRxLen = 0;
		memcpy(gRx + gRxLen, tmp, (size_t)n);
		gRxLen += (size_t)n;
	}
	while (gRxLen >= 10) {
		uint32_t magic = get_u32(gRx);
		uint32_t len;
		uint32_t total;
		uint32_t expect;
		uint32_t got;

		if (magic != LINK_MAGIC) {
			memmove(gRx, gRx + 1, gRxLen - 1);
			gRxLen--;
			continue;
		}
		len = get_u32(gRx + 6);
		if (len > LINK_MAX_PAYLOAD) {
			memmove(gRx, gRx + 1, gRxLen - 1);
			gRxLen--;
			continue;
		}
		total = 14 + len;
		if (gRxLen < total)
			return 0;
		expect = get_u32(gRx + 10 + len);
		got = crc32_update(0, gRx + 4, 6 + len);
		if (expect != got) {
			memmove(gRx, gRx + 1, gRxLen - 1);
			gRxLen--;
			continue;
		}
		handle(gRx[4], gRx[5], gRx + 10, len);
		memmove(gRx, gRx + total, gRxLen - total);
		gRxLen -= total;
		return 1;
	}
	return 0;
}

void xs_link_busy(xsMachine *the)
{
	gBusy = xsmcToInteger(xsArg(0)) ? 1 : 0;
	if (gBusy)
		close_part(0);
}

void xs_link_poll(xsMachine *the)
{
	gUiOut = NULL;
	link_start();
	if (!pull_frame() || !gUiOut)
		return;
	xsmcSetString(xsResult, (char *)gUiOut);
}

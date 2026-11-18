/*
	External ILI9341 on the Cardputer-Adv EXT header, sharing SPI2 with
	the microSD card (distinct CS). Built-in ST7789 stays on SPI3.

	EXT pin 1  GPIO3  RST
	EXT pin 5  GPIO6  DC
	EXT pin 7  GPIO40 SCK
	EXT pin 9  GPIO14 MOSI
	EXT pin 11 GPIO39 MISO  (optional; ID is not required to bring the panel up)
	EXT pin 13 GPIO5  CS
	EXT pin 4  GND
	EXT pin 6  5V    VCC and backlight, for modules that regulate 5V down to 3.3V

	Landscape 320x240, MADCTL 0x28 (MV | BGR). Init always runs: a missed ID
	used to skip it, and the backlight then stayed on a white, unprogrammed panel.
	The SD driver already tolerates ESP_ERR_INVALID_STATE when this bus is up.
*/

#include "xsmc.h"
#include "xsHost.h"

#include "commodettoPixelsOut.h"

#include "deckfont.h"

#include "driver/gpio.h"
#include "driver/spi_master.h"
#include "esp_heap_caps.h"
#include "esp_ota_ops.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"

#include <stdio.h>
#include <string.h>

#define PIN_CS		5
#define PIN_DC		6
#define PIN_RST		3
#define PIN_SD_CS	12
#define PIN_MOSI	14
#define PIN_SCK		40
#define PIN_MISO	39

#define LOGIC_W		320
#define LOGIC_H		240

#define DECK_ORIGIN	4
#define DECK_PITCH	26
#define DECK_LINES	5

#if kCommodettoBitmapFormat != kCommodettoBitmapRGB565LE
	#error external panel expects RGB565LE pixels
#endif

typedef struct {
	PixelsOutDispatch dispatch;
	spi_device_handle_t dev;
	uint8_t *dma;
	uint8_t held;
	uint8_t busOwned;
	uint8_t pins;
} PanelRecord, *Panel;

static const uint8_t kInit[] = {
	0xCB, 5, 0x39, 0x2C, 0x00, 0x34, 0x02,
	0xCF, 3, 0x00, 0xC1, 0x30,
	0xE8, 3, 0x85, 0x00, 0x78,
	0xEA, 2, 0x00, 0x00,
	0xED, 4, 0x64, 0x03, 0x12, 0x81,
	0xF7, 1, 0x20,
	0xC0, 1, 0x23,
	0xC1, 1, 0x10,
	0xC5, 2, 0x3e, 0x28,
	0xC7, 1, 0x86,
	0x36, 1, 0x28,
	0x3A, 1, 0x55,
	0xB1, 2, 0x00, 0x18,
	0xB6, 3, 0x08, 0x82, 0x27,
	0xF2, 1, 0x00,
	0x26, 1, 0x01,
	0xE0, 15, 0x0F, 0x31, 0x2B, 0x0C, 0x0E, 0x08, 0x4E, 0xF1, 0x37, 0x07, 0x10, 0x03, 0x0E, 0x09, 0x00,
	0xE1, 15, 0x00, 0x0E, 0x14, 0x03, 0x11, 0x07, 0x31, 0xC1, 0x48, 0x08, 0x0F, 0x0C, 0x31, 0x36, 0x0F,
	0x11, 0,
	0xFF, 120,
	0x29, 0,
	0xFF, 0
};

static Panel gLive;
static uint16_t gDeckRow[240];
static uint8_t gZero[LOGIC_W * 2];

static void tx_bytes(Panel p, const uint8_t *data, int n)
{
	while (n > 0) {
		int chunk = n > 4096 ? 4096 : n;
		spi_transaction_t t;

		memset(&t, 0, sizeof t);
		if (chunk <= 4) {
			t.flags = SPI_TRANS_USE_TXDATA;
			t.length = chunk * 8;
			memcpy(t.tx_data, data, chunk);
		}
		else {
			memcpy(p->dma, data, chunk);
			t.length = chunk * 8;
			t.tx_buffer = p->dma;
		}
		spi_device_polling_transmit(p->dev, &t);
		data += chunk;
		n -= chunk;
	}
}

static void read_bytes(Panel p, uint8_t *dst, int n)
{
	spi_transaction_t t;

	memset(&t, 0, sizeof t);
	t.flags = SPI_TRANS_USE_TXDATA | SPI_TRANS_USE_RXDATA;
	t.length = n * 8;
	t.rxlength = n * 8;
	spi_device_polling_transmit(p->dev, &t);
	memcpy(dst, t.rx_data, n);
}

static void bus_lock(Panel p)
{
	if (p->held)
		return;
	spi_device_acquire_bus(p->dev, portMAX_DELAY);
	gpio_set_level((gpio_num_t)PIN_CS, 0);
	p->held = 1;
}

static void bus_unlock(Panel p)
{
	if (!p->held)
		return;
	gpio_set_level((gpio_num_t)PIN_CS, 1);
	spi_device_release_bus(p->dev);
	p->held = 0;
}

static void command(Panel p, uint8_t cmd, const uint8_t *data, int n)
{
	int own = !p->held;

	if (own)
		bus_lock(p);
	gpio_set_level((gpio_num_t)PIN_DC, 0);
	tx_bytes(p, &cmd, 1);
	if (n > 0) {
		gpio_set_level((gpio_num_t)PIN_DC, 1);
		tx_bytes(p, data, n);
	}
	if (own)
		bus_unlock(p);
}

static int id_match(const uint8_t *b)
{
	int i;

	for (i = 0; i < 3; i++) {
		if (b[i] == 0x93 && b[i + 1] == 0x41)
			return 1;
	}
	return 0;
}

static int read_id(Panel p)
{
	static const uint8_t cmds[] = {0xD3, 0x04};
	int c;

	for (c = 0; c < 2; c++) {
		uint8_t b[4];
		uint8_t cmd = cmds[c];

		bus_lock(p);
		gpio_set_level((gpio_num_t)PIN_DC, 0);
		tx_bytes(p, &cmd, 1);
		gpio_set_level((gpio_num_t)PIN_DC, 1);
		read_bytes(p, b, 4);
		bus_unlock(p);
		if (id_match(b))
			return 1;
	}
	return 0;
}

static void run_table(Panel p, const uint8_t *s)
{
	for (;;) {
		uint8_t cmd = *s++;
		uint8_t n = *s++;

		if (cmd == 0xFF) {
			if (n == 0)
				return;
			modDelayMilliseconds(n);
			continue;
		}
		command(p, cmd, n ? s : NULL, n);
		s += n;
	}
}

static void panelBegin(void *refcon, CommodettoCoordinate x, CommodettoCoordinate y, CommodettoDimension w, CommodettoDimension h)
{
	Panel p = refcon;
	uint8_t arg[4];
	uint16_t x0, x1, y0, y1;

	if (!p || !p->dev || w <= 0 || h <= 0)
		return;
	bus_lock(p);
	x0 = (uint16_t)x;
	y0 = (uint16_t)y;
	x1 = (uint16_t)(x + w - 1);
	y1 = (uint16_t)(y + h - 1);
	arg[0] = (uint8_t)(x0 >> 8);
	arg[1] = (uint8_t)x0;
	arg[2] = (uint8_t)(x1 >> 8);
	arg[3] = (uint8_t)x1;
	command(p, 0x2A, arg, 4);
	arg[0] = (uint8_t)(y0 >> 8);
	arg[1] = (uint8_t)y0;
	arg[2] = (uint8_t)(y1 >> 8);
	arg[3] = (uint8_t)y1;
	command(p, 0x2B, arg, 4);
	command(p, 0x2C, NULL, 0);
	gpio_set_level((gpio_num_t)PIN_DC, 1);
}

static void panelEnd(void *refcon)
{
	Panel p = refcon;

	if (!p)
		return;
	bus_unlock(p);
}

static void panelContinue(void *refcon)
{
	(void)refcon;
}

static void panelSend(PocoPixel *pixels, int byteLength, void *refcon)
{
	Panel p = refcon;
	const uint8_t *src = (const uint8_t *)pixels;

	if (!p || !p->held || !p->dma)
		return;
	if (byteLength < 0)
		byteLength = -byteLength;
	while (byteLength > 1) {
		int chunk = byteLength > 4096 ? 4096 : byteLength;
		int i;
		spi_transaction_t t;

		if (chunk & 1)
			chunk--;
		for (i = 0; i < chunk; i += 2) {
			p->dma[i] = src[i + 1];
			p->dma[i + 1] = src[i];
		}
		memset(&t, 0, sizeof t);
		t.length = chunk * 8;
		t.tx_buffer = p->dma;
		spi_device_polling_transmit(p->dev, &t);
		src += chunk;
		byteLength -= chunk;
	}
}

static void panelAdapt(void *refcon, CommodettoRectangle invalid)
{
	(void)refcon;
	if (invalid->x & 1) {
		invalid->x -= 1;
		invalid->w += 1;
	}
	if (invalid->w & 1)
		invalid->w += 1;
	if (invalid->x < 0) {
		if (-invalid->x >= invalid->w) {
			invalid->w = 0;
			return;
		}
		invalid->w += invalid->x;
		invalid->x = 0;
	}
	if ((invalid->x + invalid->w) > LOGIC_W) {
		if (LOGIC_W <= invalid->x) {
			invalid->w = 0;
			return;
		}
		invalid->w = (CommodettoDimension)(LOGIC_W - invalid->x);
	}
}

static const PixelsOutDispatchRecord gDispatch = {
	panelBegin,
	panelContinue,
	panelEnd,
	panelSend,
	panelAdapt
};

static void panel_close(Panel p, int resetSd)
{
	if (!p)
		return;
	if (p->held && p->dev)
		bus_unlock(p);
	if (p->dev) {
		spi_bus_remove_device(p->dev);
		p->dev = NULL;
	}
	if (p->busOwned) {
		spi_bus_free(SPI2_HOST);
		p->busOwned = 0;
	}
	if (p->pins) {
		gpio_reset_pin((gpio_num_t)PIN_CS);
		gpio_reset_pin((gpio_num_t)PIN_DC);
		gpio_reset_pin((gpio_num_t)PIN_RST);
		if (resetSd)
			gpio_reset_pin((gpio_num_t)PIN_SD_CS);
		p->pins = 0;
	}
	if (p->dma) {
		heap_caps_free(p->dma);
		p->dma = NULL;
	}
}

static int panel_hw(Panel p)
{
	spi_bus_config_t bus;
	spi_device_interface_config_t dev;
	esp_err_t err;
	gpio_config_t cfg;
	int y;

	memset(&cfg, 0, sizeof cfg);
	cfg.pin_bit_mask = (1ULL << PIN_CS) | (1ULL << PIN_DC) | (1ULL << PIN_RST) | (1ULL << PIN_SD_CS);
	cfg.mode = GPIO_MODE_OUTPUT;
	cfg.pull_up_en = GPIO_PULLUP_DISABLE;
	cfg.pull_down_en = GPIO_PULLDOWN_DISABLE;
	cfg.intr_type = GPIO_INTR_DISABLE;
	if (gpio_config(&cfg) != ESP_OK)
		return 0;
	p->pins = 1;
	gpio_set_level((gpio_num_t)PIN_CS, 1);
	gpio_set_level((gpio_num_t)PIN_SD_CS, 1);
	gpio_set_level((gpio_num_t)PIN_DC, 1);
	gpio_set_level((gpio_num_t)PIN_RST, 1);

	memset(&bus, 0, sizeof bus);
	bus.mosi_io_num = PIN_MOSI;
	bus.miso_io_num = PIN_MISO;
	bus.sclk_io_num = PIN_SCK;
	bus.quadwp_io_num = -1;
	bus.quadhd_io_num = -1;
	bus.max_transfer_sz = 4096;
	err = spi_bus_initialize(SPI2_HOST, &bus, SPI_DMA_CH_AUTO);
	if (err == ESP_OK)
		p->busOwned = 1;
	else if (err != ESP_ERR_INVALID_STATE)
		return 0;

	memset(&dev, 0, sizeof dev);
	dev.clock_speed_hz = 20000000;
	dev.mode = 0;
	dev.spics_io_num = -1;
	dev.queue_size = 1;
	dev.flags = SPI_DEVICE_NO_DUMMY;
	err = spi_bus_add_device(SPI2_HOST, &dev, &p->dev);
	if (err != ESP_OK)
		return 0;

	gpio_set_level((gpio_num_t)PIN_RST, 0);
	modDelayMilliseconds(20);
	gpio_set_level((gpio_num_t)PIN_RST, 1);
	/* Datasheet: no command until 120 ms after reset, or the panel ignores
	   sleep-out / display-on and the backlight shines through a white glass. */
	modDelayMilliseconds(120);
	(void)read_id(p);

	p->dispatch = (PixelsOutDispatch)&gDispatch;
	run_table(p, kInit);
	modDelayMilliseconds(20);

	panelBegin(p, 0, 0, LOGIC_W, LOGIC_H);
	for (y = 0; y < LOGIC_H; y++)
		panelSend((PocoPixel *)gZero, LOGIC_W * 2, p);
	panelEnd(p);
	return 1;
}

static Panel panel_open(void)
{
	Panel p;

	p = c_calloc(1, sizeof(PanelRecord));
	if (!p)
		return NULL;
	p->dma = heap_caps_malloc(4096, MALLOC_CAP_DMA | MALLOC_CAP_8BIT);
	if (!p->dma) {
		c_free(p);
		return NULL;
	}
	if (!panel_hw(p)) {
		panel_close(p, 1);
		c_free(p);
		return NULL;
	}
	return p;
}

void xs_panel_destructor(void *data)
{
	Panel p = data;

	if (!p)
		return;
	if (gLive == p)
		gLive = NULL;
	panel_close(p, 0);
	c_free(p);
}

void xs_panel(xsMachine *the)
{
	Panel p;

	if (gLive) {
		xsmcSetInteger(xsResult, 0);
		return;
	}
	p = panel_open();
	if (!p) {
		xsmcSetInteger(xsResult, 0);
		return;
	}
	gLive = p;
	xsmcSetHostData(xsThis, p);
	xsmcSetInteger(xsResult, 1);
}

void xs_panel_begin(xsMachine *the)
{
	Panel p = xsmcGetHostData(xsThis);

	panelBegin(p,
		(CommodettoCoordinate)xsmcToInteger(xsArg(0)),
		(CommodettoCoordinate)xsmcToInteger(xsArg(1)),
		(CommodettoDimension)xsmcToInteger(xsArg(2)),
		(CommodettoDimension)xsmcToInteger(xsArg(3)));
}

void xs_panel_send(xsMachine *the)
{
	Panel p = xsmcGetHostData(xsThis);
	uint8_t *data;
	xsUnsignedValue count;

	xsmcGetBufferReadable(xsArg(0), (void **)&data, &count);
	if (xsmcArgc > 1) {
		xsIntegerValue offset = xsmcToInteger(xsArg(1));
		if (offset < 0 || (xsUnsignedValue)offset > count)
			return;
		data += offset;
		count -= (xsUnsignedValue)offset;
		if (xsmcArgc > 2) {
			xsIntegerValue n = xsmcToInteger(xsArg(2));
			if (n >= 0 && (xsUnsignedValue)n < count)
				count = (xsUnsignedValue)n;
		}
	}
	panelSend((PocoPixel *)data, (int)count, p);
}

void xs_panel_end(xsMachine *the)
{
	panelEnd(xsmcGetHostData(xsThis));
}

void xs_panel_format(xsMachine *the)
{
	xsmcSetInteger(xsResult, kCommodettoBitmapFormat);
}

void xs_panel_show(xsMachine *the)
{
	if (!gLive || !gLive->dev)
		return;
	command(gLive, xsmcToInteger(xsArg(0)) ? 0x29 : 0x28, NULL, 0);
}

void xs_panel_stats(xsMachine *the)
{
	char buf[96];
	uint32_t sec = (uint32_t)(esp_timer_get_time() / 1000000ULL);
	uint32_t freeb = esp_get_free_internal_heap_size();
	uint32_t total = heap_caps_get_total_size(MALLOC_CAP_INTERNAL);
	const esp_partition_t *part = esp_ota_get_running_partition();
	const char *slot = (part && part->label) ? part->label : "";

	snprintf(buf, sizeof buf, "%lu\t%lu\t%lu\t%s",
		(unsigned long)sec,
		(unsigned long)freeb,
		(unsigned long)total,
		slot);
	xsmcSetString(xsResult, buf);
}

static const DeckGlyph *glyph_for(unsigned cp)
{
	int lo = 0;
	int hi = DECK_GLYPH_COUNT - 1;

	while (lo <= hi) {
		int mid = (lo + hi) >> 1;
		unsigned c = gDeckGlyphs[mid].cp;

		if (c == cp)
			return &gDeckGlyphs[mid];
		if (c < cp)
			lo = mid + 1;
		else
			hi = mid - 1;
	}
	return NULL;
}

static int utf8_next(const char *s, const char *end, unsigned *cp)
{
	const unsigned char *u = (const unsigned char *)s;

	if (s >= end)
		return 0;
	if (u[0] < 0x80) {
		*cp = u[0];
		return 1;
	}
	if ((u[0] & 0xE0) == 0xC0 && s + 1 < end) {
		*cp = ((u[0] & 0x1F) << 6) | (u[1] & 0x3F);
		return 2;
	}
	if ((u[0] & 0xF0) == 0xE0 && s + 2 < end) {
		*cp = ((u[0] & 0x0F) << 12) | ((u[1] & 0x3F) << 6) | (u[2] & 0x3F);
		return 3;
	}
	*cp = u[0];
	return 1;
}

static int measure(const char *s, const char *end)
{
	int width = 0;

	while (s < end) {
		unsigned cp = 0;
		int n = utf8_next(s, end, &cp);
		const DeckGlyph *g;

		if (n <= 0)
			break;
		s += n;
		g = glyph_for(cp);
		width += g ? g->adv : 8;
	}
	return width;
}

static void draw_span(uint16_t *row, int y, int width, const char *s, const char *end, int x, int top, uint16_t color)
{
	while (s < end) {
		unsigned cp = 0;
		int n = utf8_next(s, end, &cp);
		const DeckGlyph *g;
		int gy;

		if (n <= 0)
			break;
		s += n;
		g = glyph_for(cp);
		if (!g) {
			x += 8;
			continue;
		}
		gy = y - (top + g->dy);
		if (gy >= 0 && gy < g->h && g->w > 0) {
			uint32_t bits = g->bits[gy];
			int col;

			for (col = 0; col < g->w; col++) {
				int xx;

				if ((bits & (1u << (g->w - 1 - col))) == 0)
					continue;
				xx = x + g->dx + col;
				if (xx >= 0 && xx < width)
					row[xx] = color;
			}
		}
		x += g->adv;
	}
}

static void paint_row(uint16_t *row, int y, int width, uint16_t bg, uint16_t ink, uint16_t accent, const char *text)
{
	const char *p = text;
	int line;
	int x;

	for (x = 0; x < width; x++)
		row[x] = bg;
	for (line = 0; line < DECK_LINES && *p; line++) {
		const char *start = p;
		const char *tab = NULL;
		const char *end = p;
		int top = DECK_ORIGIN + line * DECK_PITCH;

		while (*end && *end != '\n') {
			if (*end == '\t' && !tab)
				tab = end;
			end++;
		}
		if (y >= top && y < top + DECK_PITCH + 4) {
			if (!tab) {
				int tw = measure(start, end);
				draw_span(row, y, width, start, end, (width - tw) / 2, top, accent);
			}
			else {
				int vw = measure(tab + 1, end);
				draw_span(row, y, width, start, tab, 2, top, ink);
				draw_span(row, y, width, tab + 1, end, width - 2 - vw, top, accent);
			}
		}
		p = (*end == '\n') ? end + 1 : end;
	}
}

void xs_panel_deck(xsMachine *the)
{
	void *host;
	PixelsOutDispatch dispatch;
	int width;
	int height;
	uint16_t bg, ink, accent;
	char text[480];
	const char *src;
	int n;
	int y;

	host = xsmcGetHostData(xsArg(0));
	if (!host)
		return;
	dispatch = *(PixelsOutDispatch *)host;
	if (!dispatch || !dispatch->doBegin || !dispatch->doSend || !dispatch->doEnd)
		return;

	width = xsmcToInteger(xsArg(1));
	height = xsmcToInteger(xsArg(2));
	if (width < 1 || width > 240 || height < 1 || height > 160)
		return;
	bg = (uint16_t)xsmcToInteger(xsArg(3));
	ink = (uint16_t)xsmcToInteger(xsArg(4));
	accent = (uint16_t)xsmcToInteger(xsArg(5));
	src = xsmcToString(xsArg(6));
	n = 0;
	if (src) {
		while (src[n] && n < (int)sizeof text - 1) {
			text[n] = src[n];
			n++;
		}
	}
	text[n] = 0;

	dispatch->doBegin(host, 0, 0, (CommodettoDimension)width, (CommodettoDimension)height);
	for (y = 0; y < height; y++) {
		paint_row(gDeckRow, y, width, bg, ink, accent, text);
		dispatch->doSend((PocoPixel *)gDeckRow, width * 2, host);
	}
	dispatch->doEnd(host);
}

/*
	IR LED transmit through the RMT peripheral (ESP-IDF 5+ driver API;
	Moddable's pins/rmt still uses the legacy driver that IDF 6 removed).
	One TX channel, opened on first send, 1 µs resolution, carrier on the
	high level. Durations alternate mark / space and start with a mark.
*/

#include "xsmc.h"
#include "xsHost.h"
#include "mc.xs.h"			// xsID_length

#include "driver/rmt_tx.h"
#include "driver/rmt_encoder.h"
#include "esp_err.h"

#define kMaxHalf 32767
#define kMaxDurations 512

static rmt_channel_handle_t gChannel;
static rmt_encoder_handle_t gEncoder;
static int gPin = -1;
static uint32_t gCarrier;

static void irClose(void)
{
	if (gChannel) {
		rmt_disable(gChannel);
		rmt_del_channel(gChannel);
		gChannel = NULL;
	}
	if (gEncoder) {
		rmt_del_encoder(gEncoder);
		gEncoder = NULL;
	}
	gPin = -1;
	gCarrier = 0;
}

static void check(xsMachine *the, esp_err_t err)
{
	if (err != ESP_OK) {
		irClose();
		xsUnknownError((char *)esp_err_to_name(err));
	}
}

static void irOpen(xsMachine *the, int pin)
{
	rmt_tx_channel_config_t config = {
		.gpio_num = pin,
		.clk_src = RMT_CLK_SRC_DEFAULT,
		.resolution_hz = 1000000,
		.mem_block_symbols = 64,
		.trans_queue_depth = 2,
	};
	rmt_copy_encoder_config_t copy = {};

	irClose();
	check(the, rmt_new_tx_channel(&config, &gChannel));
	check(the, rmt_new_copy_encoder(&copy, &gEncoder));
	gPin = pin;
}

static void irCarrier(xsMachine *the, uint32_t hz)
{
	rmt_carrier_config_t carrier = {
		.frequency_hz = hz,
		.duty_cycle = 0.33f,
	};
	if (hz == gCarrier)
		return;
	check(the, rmt_apply_carrier(gChannel, &carrier));
	gCarrier = hz;
}

/* send(pin, carrierHz, durations) — blocks until the burst is out. */
void xs_ir_send(xsMachine *the)
{
	int pin = xsmcToInteger(xsArg(0));
	uint32_t hz = (uint32_t)xsmcToInteger(xsArg(1));
	int length, i, halves = 0, level = 1;
	rmt_symbol_word_t *symbols;
	rmt_transmit_config_t tx = { .loop_count = 0 };
	esp_err_t err;

	xsmcVars(1);
	xsmcGet(xsVar(0), xsArg(2), xsID_length);
	length = xsmcToInteger(xsVar(0));
	if (length <= 0 || length > kMaxDurations)
		xsRangeError("bad length");

	/* Long gaps are split, so count halves first. */
	for (i = 0; i < length; i++) {
		int d;
		xsmcGetIndex(xsVar(0), xsArg(2), i);
		d = xsmcToInteger(xsVar(0));
		if (d <= 0)
			xsRangeError("bad duration");
		halves += (d + kMaxHalf - 1) / kMaxHalf;
	}

	symbols = c_calloc((halves + 2) / 2, sizeof(rmt_symbol_word_t));
	if (!symbols)
		xsUnknownError("no memory");

	{
		int h = 0;
		for (i = 0; i < length; i++) {
			int d;
			xsmcGetIndex(xsVar(0), xsArg(2), i);
			d = xsmcToInteger(xsVar(0));
			while (d > 0) {
				int use = d > kMaxHalf ? kMaxHalf : d;
				rmt_symbol_word_t *s = &symbols[h >> 1];
				if (h & 1) {
					s->duration1 = use;
					s->level1 = level;
				}
				else {
					s->duration0 = use;
					s->level0 = level;
				}
				h++;
				d -= use;
			}
			level ^= 1;
		}
		/* Pad the last symbol with a zero-length low half. */
		if (h & 1) {
			symbols[h >> 1].duration1 = 0;
			symbols[h >> 1].level1 = 0;
			h++;
		}
		halves = h;
	}

	if (gPin != pin || !gChannel) {
		irOpen(the, pin);
		gCarrier = 0;
		irCarrier(the, hz);
		err = rmt_enable(gChannel);
	}
	else if (hz != gCarrier) {
		rmt_disable(gChannel);
		irCarrier(the, hz);
		err = rmt_enable(gChannel);
	}
	else
		err = ESP_OK;
	if (err != ESP_OK) {
		c_free(symbols);
		check(the, err);
	}

	tx.flags.eot_level = 0;
	err = rmt_transmit(gChannel, gEncoder, symbols, (halves / 2) * sizeof(rmt_symbol_word_t), &tx);
	if (err == ESP_OK)
		err = rmt_tx_wait_all_done(gChannel, 1000);
	c_free(symbols);
	check(the, err);
}

void xs_ir_close(xsMachine *the)
{
	irClose();
}

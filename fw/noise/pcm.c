/*
	Background-sound synthesis into 16-bit mono PCM at 16 kHz.
	Done in C: generating samples in JS took most of each slab's time on the
	ESP32, so the audio callbacks starved the keyboard and the stream underran.
	One synth runs at a time, so the state is a single static record.
*/

#include "xsmc.h"

#include <math.h>
#include <stdint.h>
#include <string.h>

#define kRate 16000.0f
#define kScale 20000.0f

enum {
	kWhite = 0,
	kPink,
	kBrown,
	kRain,
	kWaves,
};

static struct {
	int kind;
	uint32_t seed;
	float b0, b1, b2;		/* pink (Paul Kellet economy) */
	float br;				/* brown */
	float drop, dropAmp, lastW;	/* rain */
	float t, period;		/* waves */
} gS;

/* Uniform in [-1, 1). xorshift32. */
static inline float white(void)
{
	uint32_t x = gS.seed;
	x ^= x << 13;
	x ^= x >> 17;
	x ^= x << 5;
	gS.seed = x;
	return (float)x * (1.0f / 2147483648.0f) - 1.0f;
}

static inline float pink(float w)
{
	gS.b0 = 0.99765f * gS.b0 + w * 0.0990460f;
	gS.b1 = 0.96300f * gS.b1 + w * 0.2965164f;
	gS.b2 = 0.57000f * gS.b2 + w * 1.0526913f;
	return (gS.b0 + gS.b1 + gS.b2 + w * 0.1848f) * 0.2f;
}

static inline float brown(float w)
{
	gS.br = (gS.br + 0.02f * w) * (1.0f / 1.02f);
	return gS.br * 3.2f;
}

static inline float next(void)
{
	float w = white();
	switch (gS.kind) {
		case kPink:
			return pink(w);
		case kBrown:
			return brown(w);
		case kRain: {
			/* Soft pink bed plus sparse, quickly decaying high-passed clicks. */
			float bed = pink(w) * 0.55f;
			float hp, d;
			if (gS.drop < 0.01f && white() > 0.99825f) {
				gS.drop = 1.0f;
				gS.dropAmp = 0.25f + 0.25f * (white() + 1.0f);
			}
			hp = w - gS.lastW;
			gS.lastW = w;
			d = gS.drop * gS.dropAmp * hp * 0.5f;
			gS.drop *= 0.9644f;
			return bed + d;
		}
		case kWaves: {
			/* Brown noise under a raised-cosine swell; each swell picks a new length. */
			float swell, env;
			gS.t += 1.0f / kRate;
			if (gS.t >= gS.period) {
				gS.t -= gS.period;
				gS.period = 7.0f + 2.0f * (white() + 1.0f);
			}
			swell = 0.5f - 0.5f * cosf(6.2831853f * gS.t / gS.period);
			env = 0.15f + 0.85f * swell * swell;
			return brown(w) * env + pink(w) * 0.35f * swell;
		}
		default:
			return w * 0.6f;
	}
}

void xs_noise_reset(xsMachine *the)
{
	int kind = xsmcToInteger(xsArg(0));
	uint32_t seed = (uint32_t)xsmcToInteger(xsArg(1));
	memset(&gS, 0, sizeof(gS));
	gS.kind = kind;
	gS.seed = seed ? seed : 0x2545f491;
	gS.period = 9.0f;
}

/* fill(buffer, gain): fills the whole buffer as int16 samples, gain 0..1. */
void xs_noise_fill(xsMachine *the)
{
	void *data;
	xsUnsignedValue bytes;
	int16_t *out;
	xsUnsignedValue i, n;
	float scale = (float)xsmcToNumber(xsArg(1));

	if (scale < 0)
		scale = 0;
	else if (scale > 1)
		scale = 1;
	scale *= kScale;

	xsmcGetBufferWritable(xsArg(0), &data, &bytes);
	out = (int16_t *)data;
	n = bytes >> 1;
	for (i = 0; i < n; i++) {
		float v = next() * scale;
		if (v > 32767.0f)
			v = 32767.0f;
		else if (v < -32768.0f)
			v = -32768.0f;
		out[i] = (int16_t)v;
	}
}

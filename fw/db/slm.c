/*
	Sound level meter core: frequency weighting, exponential time weighting
	and window energy, per sample, in C. Doing this in JS cost a full pass
	over 16k samples/s on top of the mic module's own peak pass.

	Samples are scaled to full scale = 1.0 (x / 32768), same reference the
	app used before, so stored calibration offsets still apply.

	A weighting: IEC 61672 poles (20.6, 107.7, 737.9, 12194 Hz) through the
	bilinear transform at 16 kHz, normalised to 0 dB at 1 kHz. Within 0.5 dB
	of the analog curve from 31.5 Hz to 4 kHz; it rolls off near Nyquist,
	where the codec's own anti-alias filter is already cutting.
	Z weighting: only the 20 Hz high-pass section, to drop DC and rumble.
*/

#include "xsmc.h"

#include <stdint.h>
#include <string.h>

#define kRate 16000.0f
#define kStages 3

typedef struct {
	float b0, b1, b2, a1, a2;
} Biquad;

/* Gain 1.2532 (0 dB at 1 kHz) folded into the first A section. */
static const Biquad kA[kStages] = {
	{ 0.99195961f * 1.25320429f, -1.98391921f * 1.25320429f, 0.99195961f * 1.25320429f, -1.98388676f, 0.98395167f },
	{ 0.85537430f, -1.71074860f, 0.85537430f, -1.70550963f, 0.71598758f },
	{ 0.49757640f, 0.99515280f, 0.49757640f, 0.82156382f, 0.16874178f },
};
static const Biquad kZ = { 0.99195961f, -1.98391921f, 0.99195961f, -1.98388676f, 0.98395167f };

static struct {
	Biquad f[kStages];
	int stages;
	float x1[kStages], x2[kStages], y1[kStages], y2[kStages];
	float alpha;	/* per-sample exponential weight, 1 / (tau * rate) */
	float ew;		/* time-weighted mean square */
	int window;		/* samples per report */
	int n;			/* samples in the current window */
	float acc;		/* chunk-local sum of squares */
	double sum;		/* window sum of squares */
	float peak;		/* max ew in the window */
	int skip;		/* windows still settling */
	/* Merged result of windows finished during the current feed. */
	int done;
	double outSum;
	int outN;
	float outPeak;
} gS;

/* reset(aWeight, tauSeconds, window, settleWindows) */
void xs_slm_reset(xsMachine *the)
{
	int a = xsmcToBoolean(xsArg(0));
	double tau = xsmcToNumber(xsArg(1));
	int window = xsmcToInteger(xsArg(2));
	int skip = xsmcToInteger(xsArg(3));

	memset(&gS, 0, sizeof(gS));
	if (a) {
		memcpy(gS.f, kA, sizeof(kA));
		gS.stages = kStages;
	}
	else {
		gS.f[0] = kZ;
		gS.stages = 1;
	}
	if (tau < 0.01)
		tau = 0.01;
	gS.alpha = (float)(1.0 / (tau * kRate));
	gS.window = window > 64 ? window : 64;
	gS.skip = skip > 0 ? skip : 0;
}

static void endWindow(void)
{
	double ms = gS.sum / gS.n;
	if (gS.skip > 0) {
		/* Codec start-up pop and filter transients land here. Prime the
		   time weighting with this window so it starts at the right level. */
		gS.skip--;
		gS.ew = (float)ms;
	}
	else {
		if (!gS.done || gS.peak > gS.outPeak)
			gS.outPeak = gS.peak;
		gS.outSum += gS.sum;
		gS.outN += gS.n;
		gS.done++;
	}
	gS.sum = 0;
	gS.n = 0;
	gS.peak = 0;
}

/*
	feed(buffer, byteOffset, samples, out): out is a 3 x float32 buffer.
	Returns the number of windows finished (0 = nothing to report). When
	it is non-zero, out = [window mean square, time-weighted mean square
	now, max time-weighted mean square over the window(s)].
*/
void xs_slm_feed(xsMachine *the)
{
	void *data, *outData;
	xsUnsignedValue bytes, outBytes;
	xsUnsignedValue offset = (xsUnsignedValue)xsmcToInteger(xsArg(1));
	xsUnsignedValue count = (xsUnsignedValue)xsmcToInteger(xsArg(2));
	const int16_t *pcm;
	float *out;
	xsUnsignedValue i;
	int s, stages = gS.stages;
	float alpha = gS.alpha, ew = gS.ew, peak = gS.peak, acc = 0;

	xsmcGetBufferReadable(xsArg(0), &data, &bytes);
	if (offset > bytes)
		offset = bytes;
	if (count > ((bytes - offset) >> 1))
		count = (bytes - offset) >> 1;
	pcm = (const int16_t *)((const uint8_t *)data + offset);

	gS.done = 0;
	gS.outSum = 0;
	gS.outN = 0;
	gS.outPeak = 0;

	for (i = 0; i < count; i++) {
		float v = (float)pcm[i] * (1.0f / 32768.0f);
		for (s = 0; s < stages; s++) {
			const Biquad *f = &gS.f[s];
			float y = f->b0 * v + f->b1 * gS.x1[s] + f->b2 * gS.x2[s] - f->a1 * gS.y1[s] - f->a2 * gS.y2[s];
			gS.x2[s] = gS.x1[s];
			gS.x1[s] = v;
			gS.y2[s] = gS.y1[s];
			gS.y1[s] = y;
			v = y;
		}
		v *= v;
		acc += v;
		ew += (v - ew) * alpha;
		if (ew > peak)
			peak = ew;
		if (++gS.n >= gS.window) {
			gS.sum += acc;
			acc = 0;
			gS.peak = peak;
			gS.ew = ew;
			endWindow();
			ew = gS.ew;
			peak = 0;
		}
	}
	gS.sum += acc;
	gS.ew = ew;
	gS.peak = peak;

	/* Flush denormals out of idle filter state. */
	for (s = 0; s < stages; s++) {
		if (gS.y1[s] < 1e-20f && gS.y1[s] > -1e-20f)
			gS.y1[s] = 0;
		if (gS.y2[s] < 1e-20f && gS.y2[s] > -1e-20f)
			gS.y2[s] = 0;
	}

	if (gS.done) {
		xsmcGetBufferWritable(xsArg(3), &outData, &outBytes);
		if (outBytes >= 3 * sizeof(float)) {
			out = (float *)outData;
			out[0] = (float)(gS.outSum / gS.outN);
			out[1] = gS.ew;
			out[2] = gS.outPeak;
		}
	}
	xsmcSetInteger(xsResult, gS.done);
}

/*
	Hit (onset) detector for the listen mode of count. Per sample, in C.

	Made for short sharp sounds (racket on a strap, claps, knocks) and to
	ignore slow swells (a swing's whoosh, voices, fans):

	1. High-pass at kHpHz (two 2nd-order sections, 24 dB/oct). Whoosh,
	   rumble, handling and DC sit mostly below; a hit's crack does not.
	2. Energy in kHop-sample frames (4 ms), in dB.
	3. Noise floor in dB: falls fast, rises slowly, always tracking, so a
	   long loud stretch can never wedge the detector.
	4. A hit = the frame is thr dB over the floor, above minDb, and rose at
	   least rise dB over the quietest of the last kLook frames (a whoosh
	   climbs over tens of ms, a crack within a frame or two).
	5. After a hit, the next needs the level to fall release dB under that
	   hit's peak (or back near the floor) and gapMs to pass, so the strap's
	   ringing and room echo don't count twice.
*/

#include <math.h>
#include <stdint.h>
#include <string.h>

#define kRate 16000.0f
#define kHop 64
#define kLook 8
/* Frames a candidate is watched before it counts. */
#define kConfirm 3
#define kHpHz 1000.0f
#define kFloorDb -100.0f

typedef struct {
	float b0, b1, b2, a1, a2;
	float x1, x2, y1, y2;
} Biquad;

static struct {
	Biquad hp[2];
	float thr, rise, minDb, release, decay;
	int gapFrames;
	int settle;		/* frames still priming the floor */
	float acc;
	int n;
	float hist[kLook];
	int histAt;
	float floor;
	int armed;
	int pending;	/* frames since the candidate, 0 = none */
	float pendPeak;
	int pendPeakAt;
	float evPeak;
	int sinceHit;
	float levelMax;	/* max frame dB since the last read */
} gO;

static void hpInit(Biquad *f, float hz, float q)
{
	float w = 2.0f * 3.14159265f * hz / kRate;
	float c = cosf(w), s = sinf(w);
	float alpha = s / (2.0f * q);
	float a0 = 1.0f + alpha;
	memset(f, 0, sizeof(*f));
	f->b0 = (1.0f + c) / 2.0f / a0;
	f->b1 = -(1.0f + c) / a0;
	f->b2 = (1.0f + c) / 2.0f / a0;
	f->a1 = -2.0f * c / a0;
	f->a2 = (1.0f - alpha) / a0;
}

static inline float hpRun(Biquad *f, float x)
{
	float y = f->b0 * x + f->b1 * f->x1 + f->b2 * f->x2 - f->a1 * f->y1 - f->a2 * f->y2;
	f->x2 = f->x1;
	f->x1 = x;
	f->y2 = f->y1;
	f->y1 = y;
	return y;
}

void onsetReset(float thr, float rise, float minDb, float release, int gapMs, int settleMs)
{
	int i;
	memset(&gO, 0, sizeof(gO));
	/* Butterworth 4th order: Q 0.5412 and 1.3066. */
	hpInit(&gO.hp[0], kHpHz, 0.5412f);
	hpInit(&gO.hp[1], kHpHz, 1.3066f);
	gO.thr = thr;
	gO.rise = rise;
	gO.minDb = minDb;
	gO.release = release;
	gO.decay = 2.0f;
	gO.gapFrames = (int)(gapMs * kRate / 1000.0f / kHop + 0.5f);
	gO.settle = (int)(settleMs * kRate / 1000.0f / kHop + 0.5f);
	for (i = 0; i < kLook; i++)
		gO.hist[i] = kFloorDb;
	gO.floor = kFloorDb;
	gO.armed = 1;
	gO.sinceHit = 1 << 20;
	gO.levelMax = kFloorDb;
}

/* One finished frame; returns 1 on a hit. */
static int frame(float db)
{
	int i, k, hit = 0;
	float ref = 0, refDb;
	/* Reference: mean energy of the previous two frames (8 ms). Short, so
	   a crack on the tail of a fading whoosh still stands out. */
	for (i = 1; i <= 2; i++) {
		k = (gO.histAt - i + kLook) % kLook;
		ref += powf(10.0f, gO.hist[k] / 10.0f);
	}
	ref /= 2;
	refDb = ref > 1e-10f ? 10.0f * log10f(ref) : kFloorDb;
	gO.hist[gO.histAt] = db;
	gO.histAt = (gO.histAt + 1) % kLook;
	if (db > gO.levelMax)
		gO.levelMax = db;
	if (gO.sinceHit < (1 << 20))
		gO.sinceHit++;

	if (gO.settle > 0) {
		/* Codec pop and filter start-up: just learn the floor. */
		gO.settle--;
		gO.floor = gO.floor <= kFloorDb ? db : gO.floor + (db - gO.floor) * 0.2f;
		return 0;
	}

	if (gO.pending > 0) {
		/* A crack peaks within a frame or two and is already falling;
		   a whoosh keeps climbing. */
		if (db > gO.pendPeak) {
			gO.pendPeak = db;
			gO.pendPeakAt = gO.pending;
		}
		if (++gO.pending > kConfirm) {
			gO.pending = 0;
			if (gO.pendPeakAt <= 1 && db <= gO.pendPeak - gO.decay) {
				hit = 1;
				gO.sinceHit = 0;
				gO.armed = 0;
				gO.evPeak = gO.pendPeak;
			}
		}
	}
	else {
		if (!gO.armed) {
			if (db > gO.evPeak)
				gO.evPeak = db;
			if (db < gO.evPeak - gO.release || db < gO.floor + gO.thr * 0.5f)
				gO.armed = 1;
		}
		if (gO.armed && gO.sinceHit >= gO.gapFrames
			&& db >= gO.floor + gO.thr && db >= gO.minDb && db - refDb >= gO.rise) {
			gO.pending = 1;
			gO.pendPeak = db;
			gO.pendPeakAt = 0;
		}
	}

	/* Floor: down with tau ~0.2 s, up with tau ~3 s; held during events. */
	if (db < gO.floor)
		gO.floor += (db - gO.floor) * 0.02f;
	else
		gO.floor += (db - gO.floor) * (gO.pending || !gO.armed ? 0.0003f : 0.0013f);
	return hit;
}

/* Feed int16 PCM; returns hits found. */
int onsetFeed(const int16_t *pcm, int count)
{
	int i, hits = 0;
	float acc = gO.acc;
	int n = gO.n;
	for (i = 0; i < count; i++) {
		float v = (float)pcm[i] * (1.0f / 32768.0f);
		v = hpRun(&gO.hp[0], v);
		v = hpRun(&gO.hp[1], v);
		acc += v * v;
		if (++n >= kHop) {
			float ms = acc / kHop;
			float db = ms > 1e-10f ? 10.0f * log10f(ms) : kFloorDb;
			hits += frame(db);
			acc = 0;
			n = 0;
		}
	}
	gO.acc = acc;
	gO.n = n;
	for (i = 0; i < 2; i++) {
		Biquad *f = &gO.hp[i];
		if (f->y1 < 1e-20f && f->y1 > -1e-20f) f->y1 = 0;
		if (f->y2 < 1e-20f && f->y2 > -1e-20f) f->y2 = 0;
	}
	return hits;
}

#ifndef ONSET_TEST
#include "xsmc.h"

/* reset(thrDb, riseDb, minDb, releaseDb, gapMs, settleMs) */
void xs_onset_reset(xsMachine *the)
{
	onsetReset((float)xsmcToNumber(xsArg(0)), (float)xsmcToNumber(xsArg(1)),
		(float)xsmcToNumber(xsArg(2)), (float)xsmcToNumber(xsArg(3)),
		xsmcToInteger(xsArg(4)), xsmcToInteger(xsArg(5)));
}

/* feed(buffer, byteOffset, samples) -> hits */
void xs_onset_feed(xsMachine *the)
{
	void *data;
	xsUnsignedValue bytes;
	xsUnsignedValue offset = (xsUnsignedValue)xsmcToInteger(xsArg(1));
	xsUnsignedValue count = (xsUnsignedValue)xsmcToInteger(xsArg(2));
	xsmcGetBufferReadable(xsArg(0), &data, &bytes);
	if (offset > bytes)
		offset = bytes;
	if (count > ((bytes - offset) >> 1))
		count = (bytes - offset) >> 1;
	xsmcSetInteger(xsResult, onsetFeed((const int16_t *)((const uint8_t *)data + offset), (int)count));
}

/* level() -> [max frame dB since last call, floor dB] (high-passed dBFS) */
void xs_onset_level(xsMachine *the)
{
	xsmcVars(1);
	xsmcSetNewArray(xsResult, 2);
	xsmcSetNumber(xsVar(0), gO.levelMax);
	xsmcSetIndex(xsResult, 0, xsVar(0));
	xsmcSetNumber(xsVar(0), gO.floor);
	xsmcSetIndex(xsResult, 1, xsVar(0));
	gO.levelMax = kFloorDb;
}
#endif

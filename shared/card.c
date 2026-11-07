/*
	Free space on the FAT volume mounted at /sdcard.
	The files module has to mount the card before this is called.
*/

#include "xsmc.h"

#include <stdio.h>
#include <stdint.h>
#include <sys/statvfs.h>

void xs_card_space(xsMachine *the)
{
	struct statvfs st;
	unsigned long long block;
	unsigned long long total;
	unsigned long long freeb;
	char buf[80];
	int n;

	if (statvfs("/sdcard", &st) != 0) {
		xsmcSetString(xsResult, "");
		return;
	}
	block = st.f_frsize ? st.f_frsize : st.f_bsize;
	if (!block || !st.f_blocks) {
		xsmcSetString(xsResult, "");
		return;
	}
	total = block * (unsigned long long)st.f_blocks;
	freeb = block * (unsigned long long)st.f_bavail;
	n = snprintf(buf, sizeof buf, "%llu\t%llu", freeb, total);
	if (n < 0 || n >= (int)sizeof buf) {
		xsmcSetString(xsResult, "");
		return;
	}
	xsmcSetString(xsResult, buf);
}

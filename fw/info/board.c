/*
	Identity and live counters for the device-info firmware.
	Tab fields match parseSnap in format.ts:
	chip rev cores mhz flash intTotal intFree intMin
	psramTotal psramFree wifi ble reset uptime tempDeci slot idf
	Flash size and MACs are read once. Heap, uptime, and temperature
	are read on every call.
*/

#include "xsmc.h"

#include "esp_chip_info.h"
#include "esp_heap_caps.h"
#include "esp_mac.h"
#include "esp_ota_ops.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "esp_rom_spiflash.h"
#include "driver/temperature_sensor.h"

#include <stdio.h>
#include <string.h>

static int gHaveId;
static char gChip[16];
static char gRev[12];
static unsigned gCores;
static unsigned gMhz;
static unsigned gFlash;
static char gWifi[18];
static char gBle[18];
static int gReset;
static char gSlot[20];
static char gIdf[48];

static temperature_sensor_handle_t gTemp;
static int gTempState;
static char gBuf[320];

static void copy_text(char *dst, size_t n, const char *src)
{
	size_t i;

	if (!src)
		src = "?";
	for (i = 0; i + 1 < n && src[i]; i++) {
		char c = src[i];
		if (c == '\t' || c == '\n' || c == '\r')
			c = ' ';
		dst[i] = c;
	}
	dst[i] = 0;
}

static const char *chip_name(esp_chip_model_t model)
{
	switch (model) {
	case CHIP_ESP32: return "ESP32";
	case CHIP_ESP32S2: return "ESP32-S2";
	case CHIP_ESP32S3: return "ESP32-S3";
	case CHIP_ESP32C3: return "ESP32-C3";
	case CHIP_ESP32C2: return "ESP32-C2";
	case CHIP_ESP32C6: return "ESP32-C6";
	default: return "ESP";
	}
}

static void fmt_mac(char *dst, const uint8_t mac[6])
{
	snprintf(dst, 18, "%02X:%02X:%02X:%02X:%02X:%02X",
		mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

static void read_mac(char *dst, esp_mac_type_t kind)
{
	uint8_t mac[6];

	if (esp_read_mac(mac, kind) != ESP_OK) {
		copy_text(dst, 18, "?");
		return;
	}
	fmt_mac(dst, mac);
}

static unsigned flash_bytes(void)
{
	/* ROM copy of the chip size, patched by the bootloader to the real part. */
	if (!rom_spiflash_legacy_data)
		return 0;
	return g_rom_flashchip.chip_size;
}

static void load_id(void)
{
	esp_chip_info_t info;
	const esp_partition_t *part;
	unsigned major;
	unsigned minor;

	if (gHaveId)
		return;
	esp_chip_info(&info);
	copy_text(gChip, sizeof gChip, chip_name(info.model));
	major = info.revision / 100;
	minor = info.revision % 100;
	snprintf(gRev, sizeof gRev, "%u.%u", major, minor);
	gCores = info.cores;
	gMhz = esp_rom_get_cpu_ticks_per_us();
	gFlash = flash_bytes();
	read_mac(gWifi, ESP_MAC_WIFI_STA);
	read_mac(gBle, ESP_MAC_BT);
	gReset = (int)esp_reset_reason();
	part = esp_ota_get_running_partition();
	copy_text(gSlot, sizeof gSlot, part ? part->label : "?");
	copy_text(gIdf, sizeof gIdf, esp_get_idf_version());
	gHaveId = 1;
}

static int read_temp_deci(void)
{
	float c;

	if (gTempState < 0)
		return -999;
	if (!gTempState) {
		temperature_sensor_config_t cfg = TEMPERATURE_SENSOR_CONFIG_DEFAULT(-10, 80);
		if (temperature_sensor_install(&cfg, &gTemp) != ESP_OK) {
			gTempState = -1;
			return -999;
		}
		if (temperature_sensor_enable(gTemp) != ESP_OK) {
			temperature_sensor_uninstall(gTemp);
			gTemp = NULL;
			gTempState = -1;
			return -999;
		}
		gTempState = 1;
	}
	if (temperature_sensor_get_celsius(gTemp, &c) != ESP_OK)
		return -999;
	if (c >= 0)
		return (int)(c * 10.0f + 0.5f);
	return (int)(c * 10.0f - 0.5f);
}

void xs_board_read(xsMachine *the)
{
	unsigned internal;
	unsigned internalFree;
	unsigned internalMin;
	unsigned psram;
	unsigned psramFree;
	unsigned uptime;
	int temp;
	int n;

	(void)the;
	load_id();
	internal = (unsigned)heap_caps_get_total_size(MALLOC_CAP_INTERNAL);
	internalFree = (unsigned)heap_caps_get_free_size(MALLOC_CAP_INTERNAL);
	internalMin = (unsigned)heap_caps_get_minimum_free_size(MALLOC_CAP_INTERNAL);
	psram = (unsigned)heap_caps_get_total_size(MALLOC_CAP_SPIRAM);
	psramFree = (unsigned)heap_caps_get_free_size(MALLOC_CAP_SPIRAM);
	uptime = (unsigned)(esp_timer_get_time() / 1000000);
	temp = read_temp_deci();
	n = snprintf(gBuf, sizeof gBuf,
		"%s\t%s\t%u\t%u\t%u\t%u\t%u\t%u\t%u\t%u\t%s\t%s\t%d\t%u\t%d\t%s\t%s",
		gChip, gRev, gCores, gMhz, gFlash,
		internal, internalFree, internalMin, psram, psramFree,
		gWifi, gBle, gReset, uptime, temp, gSlot, gIdf);
	if (n < 0 || n >= (int)sizeof gBuf)
		xsUnknownError("snap");
	xsmcSetString(xsResult, gBuf);
}

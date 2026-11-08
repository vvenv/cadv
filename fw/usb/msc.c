/*
	Expose the Cardputer-Adv microSD over USB MSC (TinyUSB OTG).
	SDSPI sector I/O via sdmmc_card_t; prefer MSC+CDC composite.
*/

#include "xsmc.h"
#include "mc.defines.h"

#include "esp_check.h"
#include "esp_err.h"
#include "esp_log.h"
#include "driver/spi_common.h"
#include "driver/sdspi_host.h"
#include "sdmmc_cmd.h"
#include "tinyusb.h"
#include "tinyusb_default_config.h"
#include "tinyusb_msc.h"
#if CONFIG_TINYUSB_CDC_ENABLED
	#include "tinyusb_cdc_acm.h"
#endif

#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#ifndef MODDEF_SDCARD_CS
	#define MODDEF_SDCARD_CS 12
#endif
#ifndef MODDEF_SDCARD_MOSI
	#define MODDEF_SDCARD_MOSI 14
#endif
#ifndef MODDEF_SDCARD_MISO
	#define MODDEF_SDCARD_MISO 39
#endif
#ifndef MODDEF_SDCARD_SCK
	#define MODDEF_SDCARD_SCK 40
#endif
#ifndef MODDEF_SDCARD_HZ
	#define MODDEF_SDCARD_HZ 20000000
#endif
#ifndef MODDEF_SDCARD_SPI_PORT
	#define MODDEF_SDCARD_SPI_PORT SPI2_HOST
#endif

static const char *TAG = "usb_msc";

static int gReady;
static int gUsb;
static int gCdc;
static int gSpiOwned;
static sdmmc_card_t *gCard;
static sdspi_dev_handle_t gSpiDev = -1;
static tinyusb_msc_storage_handle_t gStorage;
static char gErr[48];
static char gStatus[48];

static void set_err(const char *msg)
{
	strncpy(gErr, msg, sizeof(gErr) - 1);
	gErr[sizeof(gErr) - 1] = 0;
}

static void tear_usb(void)
{
#if CONFIG_TINYUSB_CDC_ENABLED
	if (gCdc) {
		(void)tinyusb_cdcacm_deinit(TINYUSB_CDC_ACM_0);
		gCdc = 0;
	}
#endif
	if (gStorage) {
		(void)tinyusb_msc_delete_storage(gStorage);
		gStorage = NULL;
	}
	(void)tinyusb_msc_uninstall_driver();
	if (gUsb) {
		(void)tinyusb_driver_uninstall();
		gUsb = 0;
	}
}

static void tear_sd(void)
{
	if (gSpiDev >= 0) {
		(void)sdspi_host_remove_device(gSpiDev);
		gSpiDev = -1;
	}
	(void)sdspi_host_deinit();
	if (gCard) {
		free(gCard);
		gCard = NULL;
	}
	if (gSpiOwned) {
		(void)spi_bus_free(MODDEF_SDCARD_SPI_PORT);
		gSpiOwned = 0;
	}
	gReady = 0;
}

static esp_err_t init_sd(void)
{
	esp_err_t err;
	sdmmc_host_t host = SDSPI_HOST_DEFAULT();
	spi_bus_config_t bus = {
		.mosi_io_num = MODDEF_SDCARD_MOSI,
		.miso_io_num = MODDEF_SDCARD_MISO,
		.sclk_io_num = MODDEF_SDCARD_SCK,
		.quadwp_io_num = -1,
		.quadhd_io_num = -1,
		.max_transfer_sz = 4096,
	};
	sdspi_device_config_t slot = SDSPI_DEVICE_CONFIG_DEFAULT();
	sdmmc_host_t probe;

	host.slot = MODDEF_SDCARD_SPI_PORT;
	host.max_freq_khz = MODDEF_SDCARD_HZ / 1000;

	err = spi_bus_initialize(MODDEF_SDCARD_SPI_PORT, &bus, SPI_DMA_CH_AUTO);
	if (err == ESP_OK)
		gSpiOwned = 1;
	else if (err != ESP_ERR_INVALID_STATE)
		return err;

	err = (*host.init)();
	if (err != ESP_OK)
		return err;

	slot.host_id = MODDEF_SDCARD_SPI_PORT;
	slot.gpio_cs = MODDEF_SDCARD_CS;
	err = sdspi_host_init_device(&slot, &gSpiDev);
	if (err != ESP_OK)
		return err;

	gCard = (sdmmc_card_t *)calloc(1, sizeof(sdmmc_card_t));
	if (!gCard)
		return ESP_ERR_NO_MEM;

	probe = host;
	probe.slot = gSpiDev;
	err = sdmmc_card_init(&probe, gCard);
	if (err != ESP_OK) {
		free(gCard);
		gCard = NULL;
		return err;
	}

	ESP_LOGI(TAG, "SD ready: %llu sectors x %u",
		(unsigned long long)gCard->csd.capacity,
		(unsigned)gCard->csd.sector_size);
	return ESP_OK;
}

static esp_err_t init_usb(void)
{
	esp_err_t err;
	tinyusb_msc_driver_config_t msc_driver = {
		.user_flags = { .val = 0 },
		.callback = NULL,
		.callback_arg = NULL,
	};
	tinyusb_msc_storage_config_t storage_cfg = {
		.mount_point = TINYUSB_MSC_STORAGE_MOUNT_USB,
		.medium.card = gCard,
		.fat_fs = {
			.base_path = NULL,
			.config = {
				.max_files = 4,
				.format_if_mount_failed = false,
			},
			.do_not_format = true,
			.format_flags = 0,
		},
	};
	tinyusb_config_t tusb_cfg = TINYUSB_DEFAULT_CONFIG();

	err = tinyusb_msc_install_driver(&msc_driver);
	if (err != ESP_OK && err != ESP_ERR_INVALID_STATE)
		return err;

	err = tinyusb_msc_new_storage_sdmmc(&storage_cfg, &gStorage);
	if (err != ESP_OK)
		return err;

	err = tinyusb_driver_install(&tusb_cfg);
	if (err != ESP_OK)
		return err;
	gUsb = 1;

#if CONFIG_TINYUSB_CDC_ENABLED
	{
		tinyusb_config_cdcacm_t acm = {
			.cdc_port = TINYUSB_CDC_ACM_0,
			.callback_rx = NULL,
			.callback_rx_wanted_char = NULL,
			.callback_line_state_changed = NULL,
			.callback_line_coding_changed = NULL,
		};
		err = tinyusb_cdcacm_init(&acm);
		if (err == ESP_OK)
			gCdc = 1;
		else
			ESP_LOGW(TAG, "CDC init skipped: %s", esp_err_to_name(err));
	}
#endif
	return ESP_OK;
}

void xs_msc_start(xsMachine *the)
{
	esp_err_t err;

	gErr[0] = 0;
	if (gReady) {
		xsmcSetString(xsResult, "");
		return;
	}

	err = init_sd();
	if (err != ESP_OK) {
		tear_sd();
		if (err == ESP_ERR_NO_MEM)
			set_err("内存不足");
		else if (err == ESP_ERR_NOT_FOUND || err == ESP_ERR_TIMEOUT)
			set_err("无 SD 卡");
		else
			set_err("SD 初始化失败");
		xsmcSetString(xsResult, gErr);
		return;
	}

	err = init_usb();
	if (err != ESP_OK) {
		tear_usb();
		tear_sd();
		set_err("USB 启动失败");
		ESP_LOGE(TAG, "USB init: %s", esp_err_to_name(err));
		xsmcSetString(xsResult, gErr);
		return;
	}

	gReady = 1;
	xsmcSetString(xsResult, "");
}

void xs_msc_stop(xsMachine *the)
{
	(void)the;
	if (!gReady && !gUsb && !gCard)
		return;
	tear_usb();
	tear_sd();
}

void xs_msc_status(xsMachine *the)
{
	uint32_t sectors = 0;
	uint32_t size = 0;

	(void)the;
	if (gReady && gStorage) {
		(void)tinyusb_msc_get_storage_capacity(gStorage, &sectors);
		(void)tinyusb_msc_get_storage_sector_size(gStorage, &size);
	}
	else if (gCard) {
		sectors = (uint32_t)gCard->csd.capacity;
		size = (uint32_t)gCard->csd.sector_size;
	}
	snprintf(gStatus, sizeof(gStatus), "%d\t%lu\t%lu",
		gReady ? 1 : 0,
		(unsigned long)sectors,
		(unsigned long)size);
	xsmcSetString(xsResult, gStatus);
}

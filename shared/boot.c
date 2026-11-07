/*
	Install an app image into ota_1 and reboot into it.
	ota_0 stays the USB-flashed launcher. Fn+BS boots that slot again.
*/

#include "xsmc.h"
#include "xsHost.h"

#include "esp_err.h"
#include "esp_ota_ops.h"
#include "esp_rom_gpio.h"
#include "esp_system.h"
#include "hal/gpio_ll.h"

/*
	Until the display driver runs, RST/CS/backlight float and the ST7789
	will clock in garbage, then scan cold-boot noise. Hold reset, deselect,
	and keep the backlight off. manifest.json wakes the panel and the driver
	asserts DISPON only after a black fill.
*/
static void panel_drive(int pin, int level)
{
	esp_rom_gpio_pad_unhold(pin);
	esp_rom_gpio_pad_select_gpio(pin);
	gpio_ll_output_enable(GPIO_LL_GET_HW(0), pin);
	gpio_ll_set_level(GPIO_LL_GET_HW(0), pin, level);
}

__attribute__((constructor)) static void panel_hold(void)
{
	panel_drive(33, 0);
	panel_drive(37, 1);
	panel_drive(38, 0);
}

static esp_ota_handle_t gHandle;
static const esp_partition_t *gDest;
static uint8_t gOpen;

static void fail(xsMachine *the, esp_err_t err)
{
	if (gOpen) {
		esp_ota_abort(gHandle);
		gOpen = 0;
		gDest = NULL;
	}
	xsUnknownError((char *)esp_err_to_name(err));
}

void xs_ota_begin(xsMachine *the)
{
	size_t imageSize;
	const esp_partition_t *running;
	esp_err_t err;

	if (gOpen)
		xsUnknownError("busy");

	imageSize = (size_t)xsmcToInteger(xsArg(0));
	if (imageSize == 0)
		xsUnknownError("empty");

	gDest = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, NULL);
	if (!gDest)
		xsUnknownError("no slot");
	running = esp_ota_get_running_partition();
	if (running && running->address == gDest->address)
		xsUnknownError("slot busy");
	if (imageSize > gDest->size)
		xsUnknownError("too big");

	err = esp_ota_begin(gDest, imageSize, &gHandle);
	if (err != ESP_OK)
		xsUnknownError((char *)esp_err_to_name(err));
	gOpen = 1;
}

void xs_ota_write(xsMachine *the)
{
	void *data;
	xsUnsignedValue length;
	esp_err_t err;

	if (!gOpen)
		xsUnknownError("not begun");
	xsmcGetBufferReadable(xsArg(0), &data, &length);
	if (!length)
		return;
	err = esp_ota_write(gHandle, data, (size_t)length);
	if (err != ESP_OK)
		fail(the, err);
}

void xs_ota_end(xsMachine *the)
{
	esp_err_t err;

	if (!gOpen)
		xsUnknownError("not begun");
	err = esp_ota_end(gHandle);
	gOpen = 0;
	if (err != ESP_OK) {
		gDest = NULL;
		xsUnknownError((char *)esp_err_to_name(err));
	}
	err = esp_ota_set_boot_partition(gDest);
	gDest = NULL;
	if (err != ESP_OK)
		xsUnknownError((char *)esp_err_to_name(err));
	esp_restart();
}

void xs_ota_abort(xsMachine *the)
{
	(void)the;
	if (!gOpen)
		return;
	esp_ota_abort(gHandle);
	gOpen = 0;
	gDest = NULL;
}

void xs_boot_launcher(xsMachine *the)
{
	const esp_partition_t *slot;
	esp_err_t err;

	slot = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_0, NULL);
	if (!slot)
		slot = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_FACTORY, NULL);
	if (!slot)
		xsUnknownError("no launcher");
	err = esp_ota_set_boot_partition(slot);
	if (err != ESP_OK)
		xsUnknownError((char *)esp_err_to_name(err));
	esp_restart();
}

/*
	Install an app image into ota_1 and reboot into it.
	ota_0 stays the USB-flashed launcher. Fn+BS boots that slot again.

	Rollback is on (CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE): a freshly selected
	slot boots as "pending verify". If it restarts before confirming itself,
	the bootloader marks it aborted and falls back to the launcher.
*/

#include "xsmc.h"
#include "xsHost.h"

#include "esp_err.h"
#include "esp_ota_ops.h"
#include "esp_system.h"

#include <string.h>

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

	/*
		M5Launcher lives in the "test" app partition and gives installed apps
		the ota_N slots, so under it ota_0 is just another app. otadata cannot
		select a test partition; Launcher takes over on every restart and
		shows its boot screen, so restarting is the way back. Our own table
		has no test partition: the base is ota_0.
	*/
	if (esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_TEST, NULL))
		esp_restart();
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

/*
	Boot ota_1 without rewriting it when it already holds the image whose
	appended SHA-256 (its last 32 bytes) is arg 0 and whose size is arg 1.
	Returns false when the slot holds something else. On a match it never returns.
	esp_ota_set_boot_partition verifies the whole image, so a half-written
	slot is rejected there too.
*/
void xs_boot_installed(xsMachine *the)
{
	const esp_partition_t *slot;
	const esp_partition_t *running;
	void *tail;
	xsUnsignedValue tailLength;
	size_t size;
	uint8_t have[32];

	xsmcSetFalse(xsResult);
	xsmcGetBufferReadable(xsArg(0), &tail, &tailLength);
	size = (size_t)xsmcToInteger(xsArg(1));
	if (tailLength != sizeof(have) || gOpen)
		return;
	slot = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, NULL);
	if (!slot || size <= sizeof(have) || size > slot->size)
		return;
	running = esp_ota_get_running_partition();
	if (running && running->address == slot->address)
		return;
	if (esp_partition_read(slot, size - sizeof(have), have, sizeof(have)) != ESP_OK)
		return;
	if (memcmp(have, tail, sizeof(have)))
		return;
	if (esp_ota_set_boot_partition(slot) != ESP_OK)
		return;
	esp_restart();
}

/* The running image is healthy. Cancels the bootloader's pending rollback. */
void xs_boot_confirm(xsMachine *the)
{
	(void)the;
	esp_ota_mark_app_valid_cancel_rollback();
}

/* True when the app slot was rolled back: it restarted before confirming. */
void xs_boot_crashed(xsMachine *the)
{
	const esp_partition_t *slot;
	esp_ota_img_states_t state;

	xsmcSetFalse(xsResult);
	slot = esp_partition_find_first(ESP_PARTITION_TYPE_APP, ESP_PARTITION_SUBTYPE_APP_OTA_1, NULL);
	if (!slot || esp_ota_get_state_partition(slot, &state) != ESP_OK)
		return;
	if (state == ESP_OTA_IMG_ABORTED)
		xsmcSetTrue(xsResult);
}

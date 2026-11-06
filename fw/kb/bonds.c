/*
	NimBLE keeps bonds in NVS. Clear them, then reboot so the next
	advertisement is not still encrypted to a forgotten peer.
	ble_store_clear locks the host itself; do not hold ble_hs_lock here.
*/

#include "xsmc.h"
#include "xsHost.h"

#include "host/ble_store.h"
#include "esp_system.h"

void xs_bonds_clear(xsMachine *the)
{
	(void)the;
	(void)ble_store_clear();
	esp_restart();
}

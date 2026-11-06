/*
	Drop saved BLE bonds and reboot. The image build runs modules on the host,
	so this must not call native at import time.
*/

export function clearBonds() {
	return native("xs_bonds_clear").call(this);
}

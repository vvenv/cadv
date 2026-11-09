/*
	Replace Moddable's setup/network for this app.

	Default setup connects Wi-Fi from mc/config.ssid then blocks on SNTP with
	no timeout. When DNS (1.1.1.1) is unreachable, done() never runs, the
	Application never paints, and the launcher's last frame 「校验…」 stays up.

	Wi-Fi + NTP belong in AppBehavior via netboot after the first paint.
*/

export default function (done: () => void) {
	done();
}

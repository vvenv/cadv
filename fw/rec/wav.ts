/** 16 kHz mono 16-bit PCM WAV header. */
export function wavHeader(pcmBytes: number): Uint8Array {
	const out = new Uint8Array(44);
	const view = new DataView(out.buffer);
	put(out, 0, "RIFF");
	view.setUint32(4, 36 + pcmBytes, true);
	put(out, 8, "WAVE");
	put(out, 12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, 16000, true);
	view.setUint32(28, 32000, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	put(out, 36, "data");
	view.setUint32(40, pcmBytes, true);
	return out;
}

function put(out: Uint8Array, at: number, text: string) {
	for (let i = 0; i < text.length; i++)
		out[at + i] = text.charCodeAt(i);
}

// Capture the 240×135 screen of the running mcsim (Cardputer-Adv device from
// shared/sim/cardputer_adv.js) and write two PNGs:
//   <prefix>.png        the screen, 240×135, one pixel per device pixel
//   <prefix>-cover.png  1280×720 (M5Burner's cover size): the screen scaled 5×
//                       with hard pixel edges, centred on the device body colour
// Usage: swift scripts/sim-shot.swift <prefix>
// Needs Screen Recording permission for the terminal (screencapture).

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let body: (Int, Int, Int) = (0x2C, 0x26, 0x3A) // BODY in cardputer_adv.js
let margin = 16, screenW = 240, screenH = 135
let coverW = 1280, coverH = 720, zoom = 5

func fail(_ message: String) -> Never {
	FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
	exit(1)
}

guard CommandLine.arguments.count == 2 else { fail("usage: sim-shot.swift <prefix>") }
let prefix = CommandLine.arguments[1]

// 1. The mcsim window.
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
guard let window = windows.first(where: { ($0[kCGWindowOwnerName as String] as? String) == "mcsim" }),
	let windowID = window[kCGWindowNumber as String] as? Int
else { fail("no mcsim window; run ./do.sh sim <id> first") }

// 2. Capture it.
let raw = NSTemporaryDirectory() + "cadv-sim-shot-\(getpid()).png"
let capture = Process()
capture.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
capture.arguments = ["-x", "-o", "-l", String(windowID), raw]
try capture.run()
capture.waitUntilExit()
defer { try? FileManager.default.removeItem(atPath: raw) }
guard capture.terminationStatus == 0,
	let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: raw) as CFURL, nil),
	let shot = CGImageSourceCreateImageAtIndex(source, 0, nil)
else { fail("screencapture failed (Screen Recording permission?)") }

// 3. Pixels as RGBA8.
func rgba(_ image: CGImage) -> (data: [UInt8], width: Int, height: Int) {
	let w = image.width, h = image.height
	var data = [UInt8](repeating: 0, count: w * h * 4)
	let ctx = CGContext(data: &data, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
		space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
	ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
	return (data, w, h)
}
let (px, w, h) = rgba(shot)

// 4. Bounding box of the body colour = the device; the screen sits `margin` inside.
var minX = w, minY = h, maxX = -1, maxY = -1
for y in 0..<h {
	for x in 0..<w {
		let i = (y * w + x) * 4
		if abs(Int(px[i]) - body.0) <= 2 && abs(Int(px[i + 1]) - body.1) <= 2 && abs(Int(px[i + 2]) - body.2) <= 2 {
			minX = min(minX, x); maxX = max(maxX, x)
			minY = min(minY, y); maxY = max(maxY, y)
		}
	}
}
guard maxX > minX else { fail("device body not found; is the Cardputer-Adv device selected in mcsim?") }
let scale = Double(maxX - minX + 1) / Double(screenW + 2 * margin)
guard scale >= 0.99 else { fail("window too small (scale \(scale))") }

// 5. Sample the centre of each device pixel.
var screen = [UInt8](repeating: 0, count: screenW * screenH * 4)
for y in 0..<screenH {
	for x in 0..<screenW {
		let sx = minX + Int((Double(margin + x) + 0.5) * scale)
		let sy = minY + Int((Double(margin + y) + 0.5) * scale)
		let s = (sy * w + sx) * 4, d = (y * screenW + x) * 4
		screen[d] = px[s]; screen[d + 1] = px[s + 1]; screen[d + 2] = px[s + 2]; screen[d + 3] = 255
	}
}

func write(_ data: [UInt8], _ width: Int, _ height: Int, _ path: String) {
	var copy = data
	let ctx = CGContext(data: &copy, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
		space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
	let image = ctx.makeImage()!
	let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
	CGImageDestinationAddImage(dest, image, nil)
	guard CGImageDestinationFinalize(dest) else { fail("cannot write \(path)") }
	print(path)
}
write(screen, screenW, screenH, prefix + ".png")

// 6. Cover: 5× nearest neighbour on the body colour.
var cover = [UInt8](repeating: 255, count: coverW * coverH * 4)
for i in stride(from: 0, to: cover.count, by: 4) {
	cover[i] = UInt8(body.0); cover[i + 1] = UInt8(body.1); cover[i + 2] = UInt8(body.2)
}
let ox = (coverW - screenW * zoom) / 2, oy = (coverH - screenH * zoom) / 2
for y in 0..<(screenH * zoom) {
	for x in 0..<(screenW * zoom) {
		let s = ((y / zoom) * screenW + x / zoom) * 4, d = ((oy + y) * coverW + ox + x) * 4
		cover[d] = screen[s]; cover[d + 1] = screen[s + 1]; cover[d + 2] = screen[s + 2]
	}
}
write(cover, coverW, coverH, prefix + "-cover.png")

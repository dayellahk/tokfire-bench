import AppKit

// Finder displays the PNG at its pixel dimensions.
let width = 720.0, height = 480.0
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 720, pixelsHigh: 480,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
bitmap.size = NSSize(width: width, height: height)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> NSColor {
    NSColor(srgbRed: r, green: g, blue: b, alpha: 1)
}
func text(_ value: String, _ x: Double, _ top: Double, _ size: CGFloat, _ shade: NSColor, bold: Bool = false) {
    (value as NSString).draw(at: NSPoint(x: x, y: height - top - Double(size) - 5), withAttributes: [
        .font: NSFont.systemFont(ofSize: size, weight: bold ? .semibold : .regular),
        .foregroundColor: shade
    ])
}
let dark = color(0.045, 0.065, 0.105), muted = color(0.64, 0.70, 0.80), white = color(0.95, 0.97, 1)
NSGradient(starting: dark, ending: color(0.10, 0.14, 0.22))!.draw(in: NSRect(x: 0, y: 0, width: width, height: height), angle: 25)
let orange = color(1, 0.43, 0.20)
orange.setFill()
NSBezierPath(roundedRect: NSRect(x: 38, y: 437, width: 28, height: 5), xRadius: 2, yRadius: 2).fill()
text("TOKFIRE LABS", 78, 27, 12, muted, bold: true)
text("Your local AI lab. Ready to install.", 38, 65, 30, white, bold: true)
text("Drag TokFire Bench into Applications to get started.", 38, 112, 16, muted)
text("將 TokFire Bench 拖到 Applications，即可安裝。", 38, 140, 14, muted)
// Actual Finder icons are placed over these two quiet panels.
for x in [110.0, 450.0] {
    color(0.84, 0.88, 0.94).setFill()
    NSBezierPath(roundedRect: NSRect(x: x, y: 161, width: 160, height: 124), xRadius: 22, yRadius: 22).fill()
}
orange.setStroke()
let arrow = NSBezierPath()
arrow.lineWidth = 3
arrow.move(to: NSPoint(x: 307, y: 225)); arrow.line(to: NSPoint(x: 407, y: 225))
arrow.move(to: NSPoint(x: 395, y: 237)); arrow.line(to: NSPoint(x: 407, y: 225)); arrow.line(to: NSPoint(x: 395, y: 213))
arrow.stroke()
text("1  DRAG THE APP", 122, 179, 12, muted, bold: true)
text("2  DROP IT HERE", 465, 179, 12, muted, bold: true)
color(0.84, 0.88, 0.94).setFill()
NSBezierPath(roundedRect: NSRect(x: 559, y: 40, width: 132, height: 110), xRadius: 14, yRadius: 14).fill()
text("Then open TokFire Bench from Applications.", 38, 339, 16, white)
text("安裝後，請從 Applications 開啟，再退出此安裝磁碟。", 38, 367, 13, muted)
text("tokfires.com", 38, 438, 12, muted)

NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))

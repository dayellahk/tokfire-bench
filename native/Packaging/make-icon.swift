import AppKit
let folder = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
for size in [16, 32, 64, 128, 256, 512, 1024] {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    let scale = CGFloat(size) / 1024
    let transform = NSAffineTransform(); transform.scale(by: scale); transform.concat()
    let box = NSBezierPath(roundedRect: NSRect(x: 48, y: 48, width: 928, height: 928), xRadius: 210, yRadius: 210)
    NSColor(red: 0.13, green: 0.10, blue: 0.09, alpha: 1).setFill(); box.fill()
    let flame = NSImage(systemSymbolName: "flame.fill", accessibilityDescription: "TokFire")!
    let config = NSImage.SymbolConfiguration(pointSize: 660, weight: .regular).applying(.init(paletteColors: [NSColor(red: 1, green: 0.53, blue: 0.24, alpha: 1)]))
    flame.withSymbolConfiguration(config)!.draw(in: NSRect(x: 235, y: 185, width: 554, height: 680))
    image.unlockFocus()
    let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
    let data = bitmap.representation(using: .png, properties: [:])!
    if size <= 512 { try data.write(to: folder.appendingPathComponent("icon_\(size)x\(size).png")) }
    if size >= 32 { try data.write(to: folder.appendingPathComponent("icon_\(size/2)x\(size/2)@2x.png")) }
}

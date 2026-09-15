import AppKit
let folder = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
for size in [16, 32, 64, 128, 256, 512, 1024] {
    let image = NSImage(size: NSSize(width: size, height: size))
    image.lockFocus()
    let scale = CGFloat(size) / 1024
    let transform = NSAffineTransform(); transform.scale(by: scale); transform.concat()
    let box = NSBezierPath(roundedRect: NSRect(x: 48, y: 48, width: 928, height: 928), xRadius: 210, yRadius: 210)
    NSGradient(starting: NSColor(red: 0.08, green: 0.15, blue: 0.22, alpha: 1), ending: NSColor(red: 0.03, green: 0.35, blue: 0.33, alpha: 1))!.draw(in: box, angle: -35)
    NSColor(red: 0.48, green: 0.94, blue: 0.77, alpha: 1).setStroke()
    let line = NSBezierPath(); line.lineWidth = 43; line.lineCapStyle = .round; line.lineJoinStyle = .round
    let points: [(CGFloat, CGFloat)] = [(205, 510), (325, 510), (398, 700), (490, 316), (583, 628), (660, 510), (818, 510)]
    line.move(to: NSPoint(x: points[0].0, y: points[0].1))
    for point in points.dropFirst() { line.line(to: NSPoint(x: point.0, y: point.1)) }; line.stroke()
    image.unlockFocus()
    let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
    let data = bitmap.representation(using: .png, properties: [:])!
    if size <= 512 { try data.write(to: folder.appendingPathComponent("icon_\(size)x\(size).png")) }
    if size >= 32 { try data.write(to: folder.appendingPathComponent("icon_\(size/2)x\(size/2)@2x.png")) }
}

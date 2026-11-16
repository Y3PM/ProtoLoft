// macOS development utility; no production runtime dependency.
// Usage: swift .dev/tests/render_favicon.swift input.svg output.png 128
import AppKit
guard CommandLine.arguments.count == 4, let requestedSize = Int(CommandLine.arguments[3]), requestedSize > 0 else {
    fputs("Usage: render_favicon.swift input.svg output.png positive-size\n", stderr)
    exit(1)
}
let source = CommandLine.arguments[1]
let target = CommandLine.arguments[2]
let size = requestedSize
guard let image = NSImage(contentsOfFile: source) else { fatalError("Unable to decode SVG") }
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
image.draw(in: NSRect(x: 0, y: 0, width: size, height: size), from: .zero, operation: .copy, fraction: 1)
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: target))
print("Rendered \(size)px: \(target)")

import AppKit
import Foundation

let scriptDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let projectDir = scriptDir.deletingLastPathComponent()
let sourceUrl = projectDir
  .appendingPathComponent("desktop-dropper/assets/action-stand-tail-frame-0.png")
let outputUrl = projectDir
  .appendingPathComponent("desktop-dropper/assets/da-wang-app-icon.png")

guard let image = NSImage(contentsOf: sourceUrl),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  fatalError("Unable to load \(sourceUrl.path)")
}

let size = CGSize(width: 1024, height: 1024)
guard let context = CGContext(
  data: nil,
  width: Int(size.width),
  height: Int(size.height),
  bitsPerComponent: 8,
  bytesPerRow: 0,
  space: CGColorSpaceCreateDeviceRGB(),
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
  fatalError("Unable to create icon context")
}

context.clear(CGRect(origin: .zero, size: size))

let drawRect = aspectFitRect(for: cgImage, in: CGRect(x: 112, y: 88, width: 800, height: 848))

context.interpolationQuality = .high
context.draw(cgImage, in: drawRect)

guard let output = context.makeImage() else {
  fatalError("Unable to render icon")
}

let bitmap = NSBitmapImageRep(cgImage: output)
guard let png = bitmap.representation(using: .png, properties: [:]) else {
  fatalError("Unable to encode PNG")
}
try png.write(to: outputUrl)
print(outputUrl.path)

func aspectFitRect(for image: CGImage, in rect: CGRect) -> CGRect {
  let imageSize = CGSize(width: image.width, height: image.height)
  let scale = min(rect.width / imageSize.width, rect.height / imageSize.height)
  let size = CGSize(width: imageSize.width * scale, height: imageSize.height * scale)
  return CGRect(
    x: rect.midX - size.width / 2,
    y: rect.midY - size.height / 2,
    width: size.width,
    height: size.height
  )
}

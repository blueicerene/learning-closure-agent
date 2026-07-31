import AppKit
import Foundation

let scriptDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let assetsDir = scriptDir.appendingPathComponent("assets", isDirectory: true)
let greenUrl = assetsDir.appendingPathComponent("cat-green.png")
let cutoutUrl = assetsDir.appendingPathComponent("cat-cutout.png")
let sleepCutoutUrl = assetsDir.appendingPathComponent("references/dawang-sleep-cutout-reference.png")

guard let greenImage = NSImage(contentsOf: greenUrl),
      let greenCgImage = greenImage.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  fatalError("Unable to load cat image at \(greenUrl.path)")
}

let cutoutCgImage = makeGreenTransparent(greenCgImage)
writePng(cutoutCgImage, to: cutoutUrl)

let logicalSize = CGSize(width: 150, height: 176)
let renderScale: CGFloat = 2
let outputSize = CGSize(width: logicalSize.width * renderScale, height: logicalSize.height * renderScale)
let frameCount = 12

for frame in 0..<frameCount {
  let phase = Double(frame) / Double(frameCount)
  let tailAngle = CGFloat(sin(phase * .pi * 2)) * 0.20
  let bodyBob = CGFloat(sin(phase * .pi * 2 + .pi / 5)) * 1.0

  guard let context = CGContext(
    data: nil,
    width: Int(outputSize.width),
    height: Int(outputSize.height),
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else {
    fatalError("Unable to create image context")
  }

  context.clear(CGRect(origin: .zero, size: outputSize))
  context.scaleBy(x: renderScale, y: renderScale)
  drawSoftShadow(in: context)
  drawTail(cutoutCgImage, in: context, angle: tailAngle)
  drawBody(cutoutCgImage, in: context, bob: bodyBob)

  guard let output = context.makeImage() else {
    fatalError("Unable to render icon frame")
  }

  let outputUrl = assetsDir.appendingPathComponent("dropper-icon-frame-\(frame).png")
  writePng(output, to: outputUrl)
  writePng(output, to: assetsDir.appendingPathComponent("action-stand-tail-frame-\(frame).png"))
}

if let sleepImage = NSImage(contentsOf: sleepCutoutUrl),
   let sleepCgImage = sleepImage.cgImage(forProposedRect: nil, context: nil, hints: nil) {
  for frame in 0..<frameCount {
    let phase = Double(frame) / Double(frameCount)
    let breath = CGFloat(1.0 + sin(phase * .pi * 2) * 0.024)
    let drift = CGFloat(sin(phase * .pi * 2 + .pi / 4)) * 1.2
    writeFrame(named: "action-sleep-breathe-frame-\(frame)") { context in
      drawSleepCat(sleepCgImage, in: context, breath: breath, drift: drift)
    }
  }
}

for frame in 0..<frameCount {
  let phase = Double(frame) / Double(frameCount)
  let orbit = CGFloat(phase * .pi * 2)
  let bodyX = CGFloat(cos(orbit)) * 7
  let bodyY = CGFloat(sin(orbit)) * 4
  let tilt = CGFloat(sin(orbit)) * 0.08

  writeFrame(named: "action-ball-chase-frame-\(frame)") { context in
    drawPlayCat(cutoutCgImage, in: context, offset: CGPoint(x: bodyX, y: bodyY), tilt: tilt, phase: orbit)
  }
}

print("Generated standing, sleeping, and ball-chase animation frames in \(assetsDir.path)")

func makeGreenTransparent(_ image: CGImage) -> CGImage {
  let width = image.width
  let height = image.height
  let bytesPerPixel = 4
  let bytesPerRow = width * bytesPerPixel
  var pixels = [UInt8](repeating: 0, count: height * bytesPerRow)

  guard let context = CGContext(
    data: &pixels,
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: bytesPerRow,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else {
    fatalError("Unable to create processing context")
  }

  context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

  for y in 0..<height {
    for x in 0..<width {
      let offset = y * bytesPerRow + x * bytesPerPixel
      let red = Int(pixels[offset])
      let green = Int(pixels[offset + 1])
      let blue = Int(pixels[offset + 2])
      let greenDominance = green - max(red, blue)

      if green > 90 && greenDominance > 24 {
        let fade = min(255, max(0, (greenDominance - 24) * 8))
        let alpha = UInt8(255 - fade)
        pixels[offset + 3] = alpha
        if alpha < 24 {
          pixels[offset] = 0
          pixels[offset + 1] = 0
          pixels[offset + 2] = 0
          pixels[offset + 3] = 0
        } else if alpha < 230 {
          let neutralGreen = UInt8(min(255, (red + blue) / 2))
          pixels[offset + 1] = neutralGreen
        }
      }
    }
  }

  guard let provider = CGDataProvider(data: Data(pixels) as CFData),
        let output = CGImage(
          width: width,
          height: height,
          bitsPerComponent: 8,
          bitsPerPixel: 32,
          bytesPerRow: bytesPerRow,
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
          provider: provider,
          decode: nil,
          shouldInterpolate: true,
          intent: .defaultIntent
        ) else {
    fatalError("Unable to create transparent cutout")
  }

  return output
}

func drawBody(_ image: CGImage, in context: CGContext, bob: CGFloat) {
  context.saveGState()
  addBodyClip(to: context, bob: bob)
  context.clip()
  context.draw(image, in: catDrawRect(offsetY: bob))
  context.restoreGState()
}

func drawTail(_ image: CGImage, in context: CGContext, angle: CGFloat) {
  let pivot = CGPoint(x: 45, y: 117)

  context.saveGState()
  context.translateBy(x: pivot.x, y: pivot.y)
  context.rotate(by: angle)
  context.translateBy(x: -pivot.x, y: -pivot.y)
  addTailClip(to: context)
  context.clip()
  context.draw(image, in: catDrawRect(offsetY: 0))
  context.restoreGState()
}

func catDrawRect(offsetY: CGFloat) -> CGRect {
  CGRect(x: 0, y: 0 + offsetY, width: 150, height: 200)
}

func addBodyClip(to context: CGContext, bob: CGFloat) {
  context.addRect(CGRect(x: 36, y: 0 + bob, width: 114, height: 176))
}

func addTailClip(to context: CGContext) {
  context.addRect(CGRect(x: 0, y: 79, width: 62, height: 72))
}

func drawSoftShadow(in context: CGContext) {
  context.saveGState()
  context.setShadow(offset: CGSize(width: 0, height: -5), blur: 9, color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.20))
  context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 0.14))
  context.addEllipse(in: CGRect(x: 31, y: 4, width: 86, height: 16))
  context.fillPath()
  context.restoreGState()
}

func writeFrame(named name: String, draw: (CGContext) -> Void) {
  guard let context = CGContext(
    data: nil,
    width: Int(outputSize.width),
    height: Int(outputSize.height),
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else {
    fatalError("Unable to create image context")
  }

  context.clear(CGRect(origin: .zero, size: outputSize))
  context.scaleBy(x: renderScale, y: renderScale)
  draw(context)

  guard let output = context.makeImage() else {
    fatalError("Unable to render \(name)")
  }

  writePng(output, to: assetsDir.appendingPathComponent("\(name).png"))
}

func drawSleepCat(_ image: CGImage, in context: CGContext, breath: CGFloat, drift: CGFloat) {
  context.saveGState()
  context.setShadow(offset: CGSize(width: 0, height: -4), blur: 10, color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.18))
  context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 0.12))
  context.addEllipse(in: CGRect(x: 23, y: 8, width: 104, height: 17))
  context.fillPath()
  context.restoreGState()

  let fit = aspectFitRect(for: image, in: CGRect(x: 8, y: 20 + drift, width: 134, height: 132))
  let center = CGPoint(x: fit.midX, y: fit.midY)
  let breathingRect = CGRect(
    x: center.x - fit.width / 2,
    y: center.y - (fit.height * breath) / 2,
    width: fit.width,
    height: fit.height * breath
  )

  context.saveGState()
  context.interpolationQuality = .high
  context.draw(image, in: breathingRect)
  context.restoreGState()
}

func drawPlayCat(_ image: CGImage, in context: CGContext, offset: CGPoint, tilt: CGFloat, phase: CGFloat) {
  context.saveGState()
  context.setShadow(offset: CGSize(width: 0, height: -5), blur: 9, color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.18))
  context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 0.12))
  context.addEllipse(in: CGRect(x: 28 + offset.x * 0.2, y: 4, width: 90, height: 16))
  context.fillPath()
  context.restoreGState()

  let catRect = CGRect(x: offset.x, y: 0 + offset.y, width: 150, height: 200)
  context.saveGState()
  context.translateBy(x: 75 + offset.x, y: 88 + offset.y)
  context.rotate(by: tilt)
  context.translateBy(x: -75 - offset.x, y: -88 - offset.y)
  drawTail(image, in: context, angle: CGFloat(sin(Double(phase) * 1.6)) * 0.16)
  drawBody(image, in: context, bob: offset.y)
  context.restoreGState()

  let ballCenter = CGPoint(
    x: 75 + cos(phase) * 46,
    y: 58 + sin(phase) * 31
  )
  drawBall(in: context, center: ballCenter)

  _ = catRect
}

func drawBall(in context: CGContext, center: CGPoint) {
  context.saveGState()
  context.setShadow(offset: CGSize(width: 0, height: -2), blur: 4, color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.20))
  context.setFillColor(CGColor(red: 0.12, green: 0.52, blue: 0.76, alpha: 1))
  context.addEllipse(in: CGRect(x: center.x - 8, y: center.y - 8, width: 16, height: 16))
  context.fillPath()
  context.setStrokeColor(CGColor(red: 1, green: 1, blue: 1, alpha: 0.86))
  context.setLineWidth(2)
  context.move(to: CGPoint(x: center.x - 5, y: center.y + 1))
  context.addCurve(
    to: CGPoint(x: center.x + 6, y: center.y + 2),
    control1: CGPoint(x: center.x - 1, y: center.y + 8),
    control2: CGPoint(x: center.x + 3, y: center.y - 5)
  )
  context.strokePath()
  context.restoreGState()
}

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

func writePng(_ image: CGImage, to url: URL) {
  let bitmap = NSBitmapImageRep(cgImage: image)
  guard let png = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Unable to encode PNG")
  }

  do {
    try png.write(to: url)
  } catch {
    fatalError("Unable to write \(url.path): \(error)")
  }
}

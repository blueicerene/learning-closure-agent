import AppKit
import Foundation
import UniformTypeIdentifiers

let serverBaseUrl = URL(string: "http://localhost:3333")!
let webBaseUrl = URL(string: "http://127.0.0.1:5174/")!
let dropperAssetsDir = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("assets", isDirectory: true)

let draggedImageTypes: [NSPasteboard.PasteboardType] = [
  .fileURL,
  .png,
  .tiff,
  NSPasteboard.PasteboardType("public.image"),
  NSPasteboard.PasteboardType("public.jpeg"),
  NSPasteboard.PasteboardType("public.heic"),
  NSPasteboard.PasteboardType("NSFilenamesPboardType")
]

struct DroppedImage {
  let name: String
  let mimeType: String
  let data: Data
}

final class DropperAppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
  private var window: NSWindow?
  private var keepVisibleTimer: Timer?

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.regular)

    let size = NSSize(width: 176, height: 204)
    let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
    let origin = savedWindowOrigin(fallback: NSPoint(x: screenFrame.maxX - size.width - 32, y: screenFrame.minY + 110))
    let window = NSWindow(
      contentRect: NSRect(origin: origin, size: size),
      styleMask: [.borderless],
      backing: .buffered,
      defer: false
    )

    window.backgroundColor = NSColor(calibratedRed: 0.97, green: 0.985, blue: 0.99, alpha: 1)
    window.isOpaque = true
    window.hasShadow = true
    window.hidesOnDeactivate = false
    window.level = .statusBar
    window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
    window.isMovableByWindowBackground = true
    window.isReleasedWhenClosed = false
    window.delegate = self
    window.contentView = DropperView(frame: NSRect(origin: .zero, size: size))
    window.orderFrontRegardless()

    self.window = window
    keepVisibleTimer = Timer.scheduledTimer(withTimeInterval: 0.45, repeats: true) { [weak self] _ in
      self?.keepWindowVisible()
    }
  }

  func applicationDidResignActive(_ notification: Notification) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) {
      self.keepWindowVisible()
    }
  }

  func applicationDidBecomeActive(_ notification: Notification) {
    keepWindowVisible()
  }

  private func keepWindowVisible() {
    guard let window else { return }
    window.setIsVisible(true)
    window.orderFrontRegardless()
  }

  func windowDidMove(_ notification: Notification) {
    guard let window else { return }
    saveWindowOrigin(window.frame.origin)
  }
}

private let windowOriginXKey = "legalVocabDropperWindowOriginX"
private let windowOriginYKey = "legalVocabDropperWindowOriginY"

func savedWindowOrigin(fallback: NSPoint) -> NSPoint {
  guard UserDefaults.standard.object(forKey: windowOriginXKey) != nil,
        UserDefaults.standard.object(forKey: windowOriginYKey) != nil else {
    return fallback
  }

  return NSPoint(
    x: UserDefaults.standard.double(forKey: windowOriginXKey),
    y: UserDefaults.standard.double(forKey: windowOriginYKey)
  )
}

func saveWindowOrigin(_ origin: NSPoint) {
  UserDefaults.standard.set(origin.x, forKey: windowOriginXKey)
  UserDefaults.standard.set(origin.y, forKey: windowOriginYKey)
}

final class DropperView: NSView {
  private let titleLabel = NSTextField(labelWithString: "拖图片给大王")
  private let imageView = NSImageView()
  private let statusLabel = NSTextField(labelWithString: "Drop")
  private let actionFrames = loadActionFrames()
  private var frameTimer: Timer?
  private var currentFrameIndex = 0
  private var isBusy = false

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    wantsLayer = true
    layer?.backgroundColor = NSColor(calibratedRed: 0.97, green: 0.985, blue: 0.99, alpha: 1).cgColor
    layer?.cornerRadius = 16
    layer?.shadowColor = NSColor.black.cgColor
    layer?.shadowOpacity = 0.28
    layer?.shadowRadius = 18
    layer?.shadowOffset = CGSize(width: 0, height: -8)
    registerForDraggedTypes(draggedImageTypes)

    titleLabel.alignment = .center
    titleLabel.font = .systemFont(ofSize: 14, weight: .bold)
    titleLabel.textColor = NSColor(calibratedRed: 0.08, green: 0.17, blue: 0.21, alpha: 1)
    titleLabel.frame = NSRect(x: 12, y: frameRect.height - 31, width: frameRect.width - 24, height: 20)
    titleLabel.autoresizingMask = [.width, .minYMargin]
    addSubview(titleLabel)

    imageView.imageScaling = .scaleProportionallyUpOrDown
    imageView.image = actionFrames.first
    imageView.frame = NSRect(x: 15, y: 48, width: frameRect.width - 30, height: frameRect.height - 76)
    imageView.autoresizingMask = [.width, .height]
    addSubview(imageView)

    statusLabel.alignment = .center
    statusLabel.font = .systemFont(ofSize: 12, weight: .heavy)
    statusLabel.textColor = .white
    statusLabel.wantsLayer = true
    statusLabel.layer?.backgroundColor = NSColor(calibratedRed: 0.13, green: 0.30, blue: 0.37, alpha: 1).cgColor
    statusLabel.layer?.cornerRadius = 13
    statusLabel.frame = NSRect(x: 24, y: 16, width: frameRect.width - 48, height: 30)
    statusLabel.autoresizingMask = [.width, .maxYMargin]
    addSubview(statusLabel)

    frameTimer = Timer.scheduledTimer(withTimeInterval: 0.16, repeats: true) { [weak self] _ in
      self?.showNextFrame()
    }
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func mouseDown(with event: NSEvent) {
    window?.performDrag(with: event)
  }

  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
    print("Drag entered. Types: \(sender.draggingPasteboard.types?.map { $0.rawValue } ?? [])")
    setActive(true)
    return .copy
  }

  override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation {
    setActive(true)
    return .copy
  }

  override func draggingExited(_ sender: NSDraggingInfo?) {
    setActive(false)
  }

  override func prepareForDragOperation(_ sender: NSDraggingInfo) -> Bool {
    true
  }

  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
    guard !isBusy else { return false }
    guard let image = droppedImage(from: sender.draggingPasteboard) else {
      print("No readable image. Types: \(sender.draggingPasteboard.types?.map { $0.rawValue } ?? [])")
      setStatus("No image", active: false, error: true)
      resetSoon()
      return false
    }

    print("Image dropped: \(image.name)")
    uploadAndOpen(image)
    return true
  }

  override func concludeDragOperation(_ sender: NSDraggingInfo?) {
    setActive(false)
  }

  private func uploadAndOpen(_ image: DroppedImage) {
    isBusy = true
    setStatus("Open", active: true, error: false)

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let payload: [String: String] = [
          "name": image.name,
          "mimeType": image.mimeType,
          "dataUrl": "data:\(image.mimeType);base64,\(image.data.base64EncodedString())"
        ]
        let body = try JSONSerialization.data(withJSONObject: payload)
        var request = URLRequest(url: serverBaseUrl.appendingPathComponent("/api/vocab/image-lookup"))
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let response = try sendSynchronous(request)
        guard
          let json = try JSONSerialization.jsonObject(with: response) as? [String: Any],
          let key = json["key"] as? String
        else {
          throw DropperError.invalidResponse
        }

        var components = URLComponents(url: webBaseUrl, resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "desktopImageLookup", value: key)]
        guard let url = components.url else { throw DropperError.invalidResponse }

        DispatchQueue.main.async {
          NSWorkspace.shared.open(url)
          self.isBusy = false
          self.setStatus("Done", active: false, error: false)
          self.resetSoon()
        }
      } catch {
        print("Dropper error: \(error)")
        DispatchQueue.main.async {
          self.isBusy = false
          self.setStatus("Backend off?", active: false, error: true)
          self.resetSoon()
        }
      }
    }
  }

  private func setActive(_ active: Bool) {
    setStatus(active ? "DROP" : "Drop", active: active, error: false)
    imageView.alphaValue = active ? 0.86 : 1
    layer?.backgroundColor = active
      ? NSColor(calibratedRed: 0.86, green: 0.96, blue: 0.90, alpha: 1).cgColor
      : NSColor(calibratedRed: 0.96, green: 0.98, blue: 0.99, alpha: 1).cgColor
  }

  private func setStatus(_ text: String, active: Bool, error: Bool) {
    statusLabel.stringValue = text
    statusLabel.layer?.backgroundColor = error
      ? NSColor(calibratedRed: 0.57, green: 0.16, blue: 0.10, alpha: 1).cgColor
      : active
        ? NSColor(calibratedRed: 0.08, green: 0.43, blue: 0.28, alpha: 1).cgColor
        : NSColor(calibratedRed: 0.13, green: 0.30, blue: 0.37, alpha: 1).cgColor
  }

  private func resetSoon() {
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
      if !self.isBusy {
        self.setActive(false)
      }
    }
  }

  private func showNextFrame() {
    guard !isBusy, !actionFrames.isEmpty else { return }
    currentFrameIndex = (currentFrameIndex + 1) % actionFrames.count
    imageView.image = actionFrames[currentFrameIndex]
  }

  deinit {
    frameTimer?.invalidate()
  }
}

func loadActionFrames() -> [NSImage] {
  let frames = (0..<12).compactMap { frame in
    NSImage(contentsOf: dropperAssetsDir.appendingPathComponent("action-stand-tail-frame-\(frame).png"))
  }

  if !frames.isEmpty {
    return frames
  }

  let fallback = [NSImage(contentsOf: dropperAssetsDir.appendingPathComponent("dropper-icon-frame-0.png"))].compactMap { $0 }
  return fallback
}

func droppedImage(from pasteboard: NSPasteboard) -> DroppedImage? {
  if let url = droppedImageFileUrl(from: pasteboard),
     let data = try? Data(contentsOf: url) {
    return DroppedImage(
      name: url.lastPathComponent.isEmpty ? "dropped-image" : url.lastPathComponent,
      mimeType: mimeTypeFor(url),
      data: data
    )
  }

  if let data = pasteboard.data(forType: .png) {
    return DroppedImage(name: "dropped-image.png", mimeType: "image/png", data: data)
  }

  if let data = pasteboard.data(forType: NSPasteboard.PasteboardType("public.jpeg")) {
    return DroppedImage(name: "dropped-image.jpg", mimeType: "image/jpeg", data: data)
  }

  if let data = pasteboard.data(forType: NSPasteboard.PasteboardType("public.heic")) {
    return DroppedImage(name: "dropped-image.heic", mimeType: "image/heic", data: data)
  }

  if let data = pasteboard.data(forType: .tiff),
     let bitmap = NSBitmapImageRep(data: data),
     let png = bitmap.representation(using: .png, properties: [:]) {
    return DroppedImage(name: "dropped-image.png", mimeType: "image/png", data: png)
  }

  return nil
}

func droppedImageFileUrl(from pasteboard: NSPasteboard) -> URL? {
  if let urls = pasteboard.readObjects(forClasses: [NSURL.self]) as? [URL],
     let url = urls.first(where: isImageFileUrl) {
    return url
  }

  if let fileNames = pasteboard.propertyList(forType: NSPasteboard.PasteboardType("NSFilenamesPboardType")) as? [String],
     let path = fileNames.first {
    let url = URL(fileURLWithPath: path)
    return isImageFileUrl(url) ? url : nil
  }

  if let fileUrlString = pasteboard.string(forType: .fileURL),
     let url = URL(string: fileUrlString),
     isImageFileUrl(url) {
    return url
  }

  return nil
}

func isImageFileUrl(_ url: URL) -> Bool {
  guard url.isFileURL else { return false }
  if let type = try? url.resourceValues(forKeys: [.contentTypeKey]).contentType {
    return type.conforms(to: .image)
  }
  return ["png", "jpg", "jpeg", "gif", "tif", "tiff", "webp", "heic"].contains(url.pathExtension.lowercased())
}

enum DropperError: Error {
  case invalidResponse
}

func mimeTypeFor(_ url: URL) -> String {
  if let type = try? url.resourceValues(forKeys: [.contentTypeKey]).contentType,
     let mimeType = type.preferredMIMEType {
    return mimeType
  }

  switch url.pathExtension.lowercased() {
  case "jpg", "jpeg":
    return "image/jpeg"
  case "gif":
    return "image/gif"
  case "tif", "tiff":
    return "image/tiff"
  case "webp":
    return "image/webp"
  case "heic":
    return "image/heic"
  default:
    return "image/png"
  }
}

func sendSynchronous(_ request: URLRequest) throws -> Data {
  let semaphore = DispatchSemaphore(value: 0)
  var result: Result<Data, Error> = .failure(DropperError.invalidResponse)

  URLSession.shared.dataTask(with: request) { data, response, error in
    defer { semaphore.signal() }
    if let error {
      result = .failure(error)
      return
    }

    guard let httpResponse = response as? HTTPURLResponse,
          200..<300 ~= httpResponse.statusCode,
          let data else {
      result = .failure(DropperError.invalidResponse)
      return
    }

    result = .success(data)
  }.resume()

  semaphore.wait()
  return try result.get()
}

let app = NSApplication.shared
let delegate = DropperAppDelegate()
app.delegate = delegate
app.run()

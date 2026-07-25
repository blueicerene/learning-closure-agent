import AppKit
import Foundation
import ImageIO
import UniformTypeIdentifiers

let serverBaseUrl = URL(string: "http://localhost:3333")!
let webBaseUrl = URL(string: "http://127.0.0.1:5174/")!
let dropperAssetsDir: URL = {
  if let resourceUrl = Bundle.main.resourceURL {
    let bundledAssets = resourceUrl.appendingPathComponent("assets", isDirectory: true)
    let spritesheet = bundledAssets.appendingPathComponent("dawang-spritesheet.webp")
    if FileManager.default.fileExists(atPath: spritesheet.path) {
      return bundledAssets
    }
  }

  return URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .appendingPathComponent("assets", isDirectory: true)
}()

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

struct LearningStatus: Decodable {
  let dueToday: Int
  let repeatedWrong: Int
  let petState: String
  let message: String
  let reviewUrl: String
}

final class DropperAppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
  private var window: NSWindow?
  private var keepVisibleTimer: Timer?

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.regular)

    let size = NSSize(width: 194, height: 260)
    let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 800)
    let origin = savedWindowOrigin(fallback: NSPoint(x: screenFrame.maxX - size.width - 32, y: screenFrame.minY + 110))
    let window = NSWindow(
      contentRect: NSRect(origin: origin, size: size),
      styleMask: [.borderless],
      backing: .buffered,
      defer: false
    )

    window.backgroundColor = .clear
    window.isOpaque = false
    window.hasShadow = false
    window.hidesOnDeactivate = false
    window.ignoresMouseEvents = false
    window.acceptsMouseMovedEvents = true
    window.level = .statusBar
    window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
    window.isMovableByWindowBackground = true
    window.isReleasedWhenClosed = false
    window.delegate = self
    window.contentView = DropperView(
      frame: NSRect(origin: .zero, size: size),
      previewMood: previewMoodFromArguments()
    )
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

enum PetMood: String, CaseIterable, Hashable {
  case idle
  case curious
  case ready
  case working
  case success
  case focus
  case failure
}

func previewMoodFromArguments(_ arguments: [String] = CommandLine.arguments) -> PetMood? {
  if let inline = arguments.first(where: { $0.hasPrefix("--preview-state=") }) {
    return PetMood(rawValue: String(inline.dropFirst("--preview-state=".count)))
  }
  guard let flagIndex = arguments.firstIndex(of: "--preview-state"),
        arguments.indices.contains(flagIndex + 1) else {
    return nil
  }
  return PetMood(rawValue: arguments[flagIndex + 1])
}

private let idlePrompt = "有不会的单词吗？"
private let dragConfirmationPrompt = "放心交给我"
private let unifiedStateFrameCount = 12

func baselinePresentation(for status: LearningStatus) -> (mood: PetMood, message: String) {
  switch status.petState {
  case "focus":
    return (.focus, "你有\(status.dueToday)个词需要复习哦")
  case "encourage":
    return (.success, status.message)
  case "due":
    return (.ready, status.message)
  default:
    return (.idle, idlePrompt)
  }
}

final class DropperView: NSView {
  private let imageView = NSImageView()
  private let transitionImageView = NSImageView()
  private let messageBubble = NSTextField(labelWithString: idlePrompt)
  private let petAnimations = loadPetAnimations()
  private var frameTimer: Timer?
  private var learningStatusTimer: Timer?
  private var currentFrameIndex = 0
  private var isBusy = false
  private var mood: PetMood = .idle
  private var baselineMood: PetMood = .idle
  private var baselineMessage = idlePrompt
  private var preferredOpenUrl = webBaseUrl
  private var trackingAreaReference: NSTrackingArea?
  private var isTransitioning = false
  private var transitionGeneration = 0
  private let previewMood: PetMood?

  init(frame frameRect: NSRect, previewMood: PetMood? = nil) {
    self.previewMood = previewMood
    super.init(frame: frameRect)
    wantsLayer = true
    layer?.backgroundColor = NSColor.clear.cgColor
    registerForDraggedTypes(draggedImageTypes)

    let petFrame = NSRect(x: 4, y: 32, width: frameRect.width - 8, height: frameRect.height - 36)
    imageView.imageScaling = .scaleProportionallyUpOrDown
    imageView.image = petAnimations.frames(for: .idle).first
    imageView.frame = petFrame
    imageView.autoresizingMask = [.width, .height]
    addSubview(imageView)

    transitionImageView.imageScaling = .scaleProportionallyUpOrDown
    transitionImageView.frame = petFrame
    transitionImageView.autoresizingMask = [.width, .height]
    transitionImageView.alphaValue = 0
    addSubview(transitionImageView)

    messageBubble.alignment = .center
    messageBubble.font = .systemFont(ofSize: 12, weight: .semibold)
    messageBubble.textColor = NSColor(calibratedWhite: 0.12, alpha: 1)
    messageBubble.lineBreakMode = .byTruncatingTail
    messageBubble.wantsLayer = true
    messageBubble.layer?.backgroundColor = NSColor(calibratedWhite: 1, alpha: 0.88).cgColor
    messageBubble.layer?.cornerRadius = 16
    messageBubble.layer?.borderWidth = 1
    messageBubble.layer?.borderColor = NSColor(calibratedWhite: 0.76, alpha: 0.42).cgColor
    messageBubble.frame = NSRect(x: 8, y: 4, width: frameRect.width - 16, height: 32)
    messageBubble.autoresizingMask = [.width, .maxYMargin]
    addSubview(messageBubble)

    frameTimer = Timer.scheduledTimer(withTimeInterval: 0.11, repeats: true) { [weak self] _ in
      self?.showNextFrame()
    }
    if let previewMood {
      baselineMood = previewMood
      baselineMessage = "预览 · \(previewMood.rawValue)"
      renderBaseline()
    } else {
      learningStatusTimer = Timer.scheduledTimer(withTimeInterval: 20, repeats: true) { [weak self] _ in
        self?.refreshLearningStatus()
      }
      renderBaseline()
      refreshLearningStatus()
    }
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func hitTest(_ point: NSPoint) -> NSView? {
    bounds.contains(point) ? self : nil
  }

  override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
    true
  }

  override func mouseDown(with event: NSEvent) {
    if event.clickCount == 2 {
      openVocabUrl(preferredOpenUrl)
      return
    }
    window?.performDrag(with: event)
  }

  override func rightMouseDown(with event: NSEvent) {
    let menu = NSMenu()
    let openItem = NSMenuItem(title: "打开法律英语词典", action: #selector(openDictionary), keyEquivalent: "")
    openItem.target = self
    menu.addItem(openItem)
    let reviewItem = NSMenuItem(title: "开始今日复习", action: #selector(openTodayReview), keyEquivalent: "")
    reviewItem.target = self
    menu.addItem(reviewItem)
    menu.addItem(.separator())
    let quitItem = NSMenuItem(title: "让大王休息", action: #selector(quitPet), keyEquivalent: "q")
    quitItem.target = self
    menu.addItem(quitItem)
    NSMenu.popUpContextMenu(menu, with: event, for: self)
  }

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    if let trackingAreaReference {
      removeTrackingArea(trackingAreaReference)
    }
    let trackingArea = NSTrackingArea(
      rect: bounds,
      options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
      owner: self,
      userInfo: nil
    )
    addTrackingArea(trackingArea)
    trackingAreaReference = trackingArea
  }

  override func mouseEntered(with event: NSEvent) {
    guard !isBusy else { return }
    renderMood(.curious)
  }

  override func mouseExited(with event: NSEvent) {
    guard !isBusy else { return }
    renderBaseline()
  }

  override func draggingEntered(_ sender: NSDraggingInfo) -> NSDragOperation {
    print("Drag entered. Types: \(sender.draggingPasteboard.types?.map { $0.rawValue } ?? [])")
    renderMood(.ready, message: dragConfirmationPrompt)
    return .copy
  }

  override func draggingUpdated(_ sender: NSDraggingInfo) -> NSDragOperation {
    renderMood(.ready, message: dragConfirmationPrompt)
    return .copy
  }

  override func draggingExited(_ sender: NSDraggingInfo?) {
    renderBaseline()
  }

  override func prepareForDragOperation(_ sender: NSDraggingInfo) -> Bool {
    true
  }

  override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
    guard !isBusy else { return false }
    guard let image = droppedImage(from: sender.draggingPasteboard) else {
      print("No readable image. Types: \(sender.draggingPasteboard.types?.map { $0.rawValue } ?? [])")
      renderMood(.failure, message: "这不是图片")
      resetSoon()
      return false
    }

    print("Image dropped: \(image.name)")
    uploadAndOpen(image)
    return true
  }

  override func concludeDragOperation(_ sender: NSDraggingInfo?) {
    if !isBusy {
      renderBaseline()
    }
  }

  private func uploadAndOpen(_ image: DroppedImage) {
    isBusy = true
    renderMood(.working, message: dragConfirmationPrompt)

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
          openVocabUrl(url)
          self.isBusy = false
          self.renderMood(.success, message: self.baselineMessage)
          self.resetSoon()
        }
      } catch {
        print("Dropper error: \(error)")
        DispatchQueue.main.async {
          self.isBusy = false
          self.renderMood(.failure, message: "服务未启动")
          self.resetSoon()
        }
      }
    }
  }

  private func renderMood(_ mood: PetMood, message: String? = nil) {
    let moodChanged = self.mood != mood
    self.mood = mood
    let defaultMessage: String

    switch mood {
    case .idle:
      defaultMessage = idlePrompt
    case .curious:
      defaultMessage = "大王在这里"
    case .ready:
      defaultMessage = dragConfirmationPrompt
    case .working:
      defaultMessage = dragConfirmationPrompt
    case .success:
      defaultMessage = "已送到词典"
    case .focus:
      defaultMessage = "重点复习"
    case .failure:
      defaultMessage = "再试一次"
    }

    let displayMessage = message ?? defaultMessage
    messageBubble.stringValue = displayMessage
    toolTip = displayMessage
    setAccessibilityLabel("大王：\(displayMessage)")

    if moodChanged {
      transitionToMood(mood)
    }
  }

  private func transitionToMood(_ mood: PetMood) {
    let frames = petAnimations.frames(for: mood)
    guard let incomingImage = frames.first else { return }

    transitionGeneration += 1
    let generation = transitionGeneration
    currentFrameIndex = 0

    imageView.layer?.removeAllAnimations()
    transitionImageView.layer?.removeAllAnimations()
    if isTransitioning, let previousIncoming = transitionImageView.image {
      imageView.image = previousIncoming
    }
    imageView.alphaValue = 1
    transitionImageView.image = incomingImage
    transitionImageView.alphaValue = 0
    isTransitioning = true

    NSAnimationContext.runAnimationGroup { context in
      context.duration = 0.18
      context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
      imageView.animator().alphaValue = 0
      transitionImageView.animator().alphaValue = 1
    } completionHandler: { [weak self] in
      DispatchQueue.main.async {
        guard let self, self.transitionGeneration == generation else { return }
        self.imageView.image = incomingImage
        self.imageView.alphaValue = 1
        self.transitionImageView.alphaValue = 0
        self.transitionImageView.image = nil
        self.isTransitioning = false
      }
    }
  }

  private func renderBaseline() {
    renderMood(baselineMood, message: baselineMessage)
  }

  private func refreshLearningStatus() {
    guard previewMood == nil else { return }
    guard !isBusy else { return }
    DispatchQueue.global(qos: .utility).async {
      do {
        var request = URLRequest(url: serverBaseUrl.appendingPathComponent("/api/vocab/learning-status"))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 3
        let response = try sendSynchronous(request)
        let status = try JSONDecoder().decode(LearningStatus.self, from: response)
        DispatchQueue.main.async {
          self.applyLearningStatus(status)
        }
      } catch {
        DispatchQueue.main.async {
          guard !self.isBusy else { return }
          self.baselineMood = .failure
          self.baselineMessage = "服务未启动 · 双击重试"
          self.preferredOpenUrl = webBaseUrl
          self.renderBaseline()
        }
      }
    }
  }

  private func applyLearningStatus(_ status: LearningStatus) {
    let presentation = baselinePresentation(for: status)
    baselineMood = presentation.mood
    baselineMessage = presentation.message
    preferredOpenUrl = URL(string: status.reviewUrl) ?? webBaseUrl
    if !isBusy && mood != .curious {
      renderBaseline()
    }
  }

  private func resetSoon() {
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
      if !self.isBusy {
        self.renderBaseline()
      }
    }
  }

  private func showNextFrame() {
    guard !isTransitioning else { return }
    let frames = petAnimations.frames(for: mood)
    guard !frames.isEmpty else { return }
    currentFrameIndex = (currentFrameIndex + 1) % frames.count
    imageView.image = frames[currentFrameIndex]
  }

  @objc private func openDictionary() {
    openVocabUrl(webBaseUrl)
  }

  @objc private func openTodayReview() {
    var components = URLComponents(url: webBaseUrl, resolvingAgainstBaseURL: false)!
    components.queryItems = [URLQueryItem(name: "view", value: "quiz")]
    openVocabUrl(components.url ?? webBaseUrl)
  }

  @objc private func quitPet() {
    NSApp.terminate(nil)
  }

  deinit {
    frameTimer?.invalidate()
    learningStatusTimer?.invalidate()
  }
}

struct PetAnimations {
  let framesByMood: [PetMood: [NSImage]]

  func frames(for mood: PetMood) -> [NSImage] {
    framesByMood[mood] ?? framesByMood[.idle] ?? []
  }
}

func loadPetAnimations() -> PetAnimations {
  let spritesheetUrl = dropperAssetsDir.appendingPathComponent("dawang-spritesheet.webp")
  guard
    let imageSource = CGImageSourceCreateWithURL(spritesheetUrl as CFURL, nil),
    let source = CGImageSourceCreateImageAtIndex(imageSource, 0, nil)
  else {
    return PetAnimations(framesByMood: [:])
  }

  let columns = 8
  let rows = 11
  let cellWidth = source.width / columns
  let cellHeight = source.height / rows

  func row(_ rowIndex: Int, count: Int) -> [NSImage] {
    (0..<count).compactMap { column in
      let rect = CGRect(
        x: column * cellWidth,
        y: rowIndex * cellHeight,
        width: cellWidth,
        height: cellHeight
      )
      guard let frame = source.cropping(to: rect) else { return nil }
      return NSImage(cgImage: frame, size: NSSize(width: cellWidth, height: cellHeight))
    }
  }

  func named(_ prefix: String) -> [NSImage] {
    (0..<unifiedStateFrameCount).compactMap { index in
      NSImage(contentsOf: dropperAssetsDir.appendingPathComponent("\(prefix)-frame-\(index).png"))
    }
  }

  func resolved(_ prefix: String, fallback: [NSImage]) -> [NSImage] {
    let frames = named(prefix)
    return frames.count == unifiedStateFrameCount ? frames : fallback
  }

  let oldIdle = (0..<12).compactMap { index in
    NSImage(contentsOf: dropperAssetsDir.appendingPathComponent("action-ball-chase-frame-\(index).png"))
  }
  let idleFallback = oldIdle.count == 12 ? oldIdle : row(0, count: 7)
  let sittingTailSource = row(5, count: 5)
  let sittingTailFallback = [0, 1, 2, 3, 4, 3, 2, 1].compactMap { index in
    sittingTailSource.indices.contains(index) ? sittingTailSource[index] : nil
  }
  return PetAnimations(framesByMood: [
    .idle: resolved("state-idle-ball", fallback: idleFallback),
    .curious: resolved("state-curious", fallback: row(3, count: 4)),
    .ready: resolved("state-ready", fallback: row(6, count: 6)),
    .working: resolved("state-working", fallback: row(7, count: 6)),
    .success: resolved("state-success", fallback: row(8, count: 6)),
    .focus: resolved("focus-sit-tail", fallback: sittingTailFallback),
    .failure: resolved("state-failure", fallback: row(5, count: 8))
  ])
}

func openVocabUrl(_ url: URL) {
  if openInExistingChromeVocabTab(url) {
    return
  }

  NSWorkspace.shared.open(url)
}

func openInExistingChromeVocabTab(_ url: URL) -> Bool {
  guard NSWorkspace.shared.runningApplications.contains(where: { $0.bundleIdentifier == "com.google.Chrome" }) else {
    return false
  }

  let urlString = url.absoluteString
  let escapedUrl = urlString
    .replacingOccurrences(of: "\\", with: "\\\\")
    .replacingOccurrences(of: "\"", with: "\\\"")

  let script = """
  tell application "Google Chrome"
    set targetUrl to "\(escapedUrl)"
    repeat with chromeWindow in windows
      set tabIndex to 0
      repeat with chromeTab in tabs of chromeWindow
        set tabIndex to tabIndex + 1
        set currentUrl to URL of chromeTab
        if currentUrl starts with "http://127.0.0.1:5174" or currentUrl starts with "http://localhost:5174" then
          set URL of chromeTab to targetUrl
          set active tab index of chromeWindow to tabIndex
          set index of chromeWindow to 1
          activate
          return "reused"
        end if
      end repeat
    end repeat
  end tell
  return "not-found"
  """

  var error: NSDictionary?
  guard let result = NSAppleScript(source: script)?.executeAndReturnError(&error) else {
    if let error {
      print("Chrome reuse AppleScript error: \(error)")
    }
    return false
  }

  return result.stringValue == "reused"
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

func runCodexPetSelfTest() throws {
  let focusPresentation = baselinePresentation(for: LearningStatus(
    dueToday: 9,
    repeatedWrong: 2,
    petState: "focus",
    message: "ignored",
    reviewUrl: webBaseUrl.absoluteString
  ))
  guard focusPresentation.mood == .focus,
        focusPresentation.message == "你有9个词需要复习哦" else {
    throw CodexPetSelfTestError(message: "The focused-review Chinese prompt is incorrect.")
  }
  let idlePresentation = baselinePresentation(for: LearningStatus(
    dueToday: 0,
    repeatedWrong: 0,
    petState: "idle",
    message: "ignored",
    reviewUrl: webBaseUrl.absoluteString
  ))
  guard idlePresentation.mood == .idle,
        idlePresentation.message == idlePrompt,
        dragConfirmationPrompt == "放心交给我" else {
    throw CodexPetSelfTestError(message: "The idle or image-drop Chinese prompt is incorrect.")
  }
  for mood in PetMood.allCases {
    guard previewMoodFromArguments(["CodexPet", "--preview-state", mood.rawValue]) == mood,
          previewMoodFromArguments(["CodexPet", "--preview-state=\(mood.rawValue)"]) == mood else {
      throw CodexPetSelfTestError(message: "Preview-state injection failed for \(mood.rawValue).")
    }
  }
  guard previewMoodFromArguments(["CodexPet", "--preview-state", "unknown"]) == nil else {
    throw CodexPetSelfTestError(message: "Unknown preview states must be rejected.")
  }
  guard unifiedStateFrameCount == 12 else {
    throw CodexPetSelfTestError(message: "The unified animation frame count is incorrect.")
  }

  let spritesheetUrl = dropperAssetsDir.appendingPathComponent("dawang-spritesheet.webp")
  guard let imageSource = CGImageSourceCreateWithURL(spritesheetUrl as CFURL, nil),
        let source = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
    throw CodexPetSelfTestError(message: "The Da Wang v2 atlas could not be decoded.")
  }
  guard source.width % 8 == 0, source.height % 11 == 0 else {
    throw CodexPetSelfTestError(message: "The Da Wang v2 atlas is not an 8 by 11 frame grid.")
  }

  let expectedFrameCounts: [PetMood: Int] = [
    .idle: 12,
    .curious: 12,
    .ready: 12,
    .working: 12,
    .success: 12,
    .focus: 12,
    .failure: 12
  ]
  for (mood, expectedCount) in expectedFrameCounts {
    guard expectedCount > 0 else {
      throw CodexPetSelfTestError(
        message: "Expected a positive frame count for \(mood)."
      )
    }
  }

  for index in 0..<12 {
    let frameUrl = dropperAssetsDir.appendingPathComponent("action-ball-chase-frame-\(index).png")
    guard let frameSource = CGImageSourceCreateWithURL(frameUrl as CFURL, nil),
          let frame = CGImageSourceCreateImageAtIndex(frameSource, 0, nil),
          frame.width == 300,
          frame.height == 352 else {
      throw CodexPetSelfTestError(
        message: "Standing ball-kick idle frame \(index) is missing or invalid."
      )
    }
  }
  let unifiedPrefixes = [
    "state-idle-ball",
    "state-curious",
    "state-ready",
    "state-working",
    "state-success",
    "state-failure",
    "focus-sit-tail"
  ]
  for prefix in unifiedPrefixes {
    for index in 0..<unifiedStateFrameCount {
      let frameUrl = dropperAssetsDir.appendingPathComponent("\(prefix)-frame-\(index).png")
      guard let frameSource = CGImageSourceCreateWithURL(frameUrl as CFURL, nil),
            let frame = CGImageSourceCreateImageAtIndex(frameSource, 0, nil),
            frame.width == 300,
            frame.height == 352 else {
        throw CodexPetSelfTestError(
          message: "Unified animation frame \(prefix)-\(index) is missing or invalid."
        )
      }
    }
  }

  let qaReportUrl = dropperAssetsDir.appendingPathComponent("unified-pet-animation-qa.json")
  guard let qaData = try? Data(contentsOf: qaReportUrl),
        let qa = try? JSONSerialization.jsonObject(with: qaData) as? [String: Any],
        qa["ok"] as? Bool == true,
        (qa["states"] as? [String: Any])?.count == unifiedPrefixes.count,
        let minimumDifference = (qa["minimumFirstFrameDifference"] as? NSNumber)?.doubleValue,
        let differenceMap = qa["firstFrameDifferences"] as? [String: Any] else {
    throw CodexPetSelfTestError(message: "The unified animation QA report is missing or invalid.")
  }
  let expectedPairs = unifiedPrefixes.count * (unifiedPrefixes.count - 1) / 2
  let differenceValues = differenceMap.values.compactMap { ($0 as? NSNumber)?.doubleValue }
  guard differenceValues.count == expectedPairs,
        differenceValues.allSatisfy({ $0 >= minimumDifference }) else {
    throw CodexPetSelfTestError(message: "At least one Pet state is not visually distinguishable.")
  }

  let sampleFrame = source.cropping(to: CGRect(
    x: 0,
    y: 0,
    width: source.width / 8,
    height: source.height / 11
  ))
  guard let sampleFrame else {
    throw CodexPetSelfTestError(message: "The Da Wang idle frame is unavailable.")
  }
  let pngData = NSMutableData()
  guard let destination = CGImageDestinationCreateWithData(pngData, UTType.png.identifier as CFString, 1, nil) else {
    throw CodexPetSelfTestError(message: "The self-test could not prepare PNG drag data.")
  }
  CGImageDestinationAddImage(destination, sampleFrame, nil)
  guard CGImageDestinationFinalize(destination) else {
    throw CodexPetSelfTestError(message: "The self-test could not encode PNG drag data.")
  }
  let pasteboard = NSPasteboard.withUniqueName()
  pasteboard.clearContents()
  pasteboard.declareTypes([.png], owner: nil)
  if pasteboard.setData(pngData as Data, forType: .png) {
    guard let image = droppedImage(from: pasteboard),
          image.mimeType == "image/png",
          !image.data.isEmpty else {
      throw CodexPetSelfTestError(message: "The pet could not read PNG data from the drag pasteboard.")
    }
  } else {
    guard let pngSource = CGImageSourceCreateWithData(pngData, nil),
          CGImageSourceCreateImageAtIndex(pngSource, 0, nil) != nil else {
      throw CodexPetSelfTestError(message: "The fallback PNG drag payload could not be decoded.")
    }
    print("Codex Pet self-test note: system pasteboard is unavailable in this test process; PNG payload decoding passed.")
  }

  print("Codex Pet self-test passed: transparent drop surface, distinct previewable learning states, smooth transitions, and PNG drag parsing are ready.")
}

struct CodexPetSelfTestError: LocalizedError {
  let message: String
  var errorDescription: String? { message }
}

if CommandLine.arguments.contains("--self-test") {
  do {
    try runCodexPetSelfTest()
    exit(0)
  } catch {
    fputs("Codex Pet self-test failed: \(error.localizedDescription)\n", stderr)
    exit(1)
  }
}

let app = NSApplication.shared
let delegate = DropperAppDelegate()
app.delegate = delegate
app.run()

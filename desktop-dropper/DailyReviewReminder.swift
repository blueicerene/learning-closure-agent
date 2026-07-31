import AppKit
import EventKit
import Foundation
import UserNotifications

struct DailyReminderSnapshot: Equatable {
  let identifier: String
  let dueDate: Date?
}

struct DailyReminderReconciliation: Equatable {
  let keepIdentifier: String?
  let removeIdentifiers: [String]
  let shouldCreate: Bool
  let shouldComplete: Bool
}

enum DailyReminderPolicy {
  static func reconcile(
    needsReview: Bool,
    reminders: [DailyReminderSnapshot]
  ) -> DailyReminderReconciliation {
    let sorted = reminders.sorted {
      ($0.dueDate ?? .distantFuture, $0.identifier) <
        ($1.dueDate ?? .distantFuture, $1.identifier)
    }
    let keep = sorted.first?.identifier
    return DailyReminderReconciliation(
      keepIdentifier: keep,
      removeIdentifiers: sorted.dropFirst().map(\.identifier),
      shouldCreate: needsReview && keep == nil,
      shouldComplete: !needsReview && keep != nil
    )
  }

  static func nextEightPM(after now: Date, calendar: Calendar = .current) -> Date {
    var components = calendar.dateComponents([.year, .month, .day], from: now)
    components.hour = 20
    components.minute = 0
    components.second = 0
    let today = calendar.date(from: components) ?? now
    if today > now {
      return today
    }
    return calendar.date(byAdding: .day, value: 1, to: today) ?? today
  }
}

final class DailyReviewReminderCoordinator {
  static let shared = DailyReviewReminderCoordinator()

  private let eventStore = EKEventStore()
  private let notificationCenter = UNUserNotificationCenter.current()
  private let defaults = UserDefaults.standard
  private let reminderMarker = URL(string: "dawang-review://daily-plan")!
  private let localNotificationIdentifier = "local.learning-closure.daily-review"
  private let enabledKey = "dailyReviewReminderEnabled"
  private let calendarIdentifierKey = "dailyReviewReminderCalendarIdentifier"
  private var lastSyncSignature: String?
  private var isSyncing = false

  var isEnabled: Bool {
    defaults.bool(forKey: enabledKey)
  }

  var menuTitle: String {
    isEnabled ? "关闭每日 20:00 提醒" : "开启每日 20:00 提醒"
  }

  func toggle(from window: NSWindow?) {
    if isEnabled {
      disable(from: window)
    } else {
      enable(from: window)
    }
  }

  func sync(planTotal: Int, planCompleted: Int) {
    guard isEnabled else { return }
    let needsReview = planTotal > planCompleted
    let signature = "\(Calendar.current.startOfDay(for: Date()).timeIntervalSince1970):\(needsReview)"
    guard signature != lastSyncSignature, !isSyncing else { return }
    lastSyncSignature = signature
    isSyncing = true

    scheduleMacNotification(needsReview: needsReview)
    guard reminderAuthorizationAllowsAccess else {
      isSyncing = false
      return
    }
    reconcileEventKitReminder(needsReview: needsReview) { [weak self] in
      self?.isSyncing = false
    }
  }

  private func enable(from window: NSWindow?) {
    requestReminderAccess { [weak self] reminderGranted in
      guard let self else { return }
      self.requestNotificationAccess { notificationGranted in
        DispatchQueue.main.async {
          self.defaults.set(reminderGranted || notificationGranted, forKey: self.enabledKey)
          self.lastSyncSignature = nil

          if reminderGranted {
            self.selectReminderCalendarIfNeeded(from: window) { selected in
              self.showEnableResult(
                reminderAvailable: selected,
                notificationAvailable: notificationGranted,
                from: window
              )
            }
          } else {
            self.showEnableResult(
              reminderAvailable: false,
              notificationAvailable: notificationGranted,
              from: window
            )
          }
        }
      }
    }
  }

  private func disable(from window: NSWindow?) {
    defaults.set(false, forKey: enabledKey)
    lastSyncSignature = nil
    notificationCenter.removePendingNotificationRequests(
      withIdentifiers: [localNotificationIdentifier]
    )
    if reminderAuthorizationAllowsAccess {
      fetchManagedReminders { [weak self] reminders in
        guard let self else { return }
        for reminder in reminders {
          try? self.eventStore.remove(reminder, commit: false)
        }
        if !reminders.isEmpty {
          try? self.eventStore.commit()
        }
      }
    }
    showAlert(
      title: "每日提醒已关闭",
      message: "大王不会再发送 20:00 复习提醒。",
      from: window
    )
  }

  private var reminderAuthorizationAllowsAccess: Bool {
    let status = EKEventStore.authorizationStatus(for: .reminder)
    if #unavailable(macOS 14.0) {
      return status == .authorized
    }
    return status == .fullAccess
  }

  private func requestReminderAccess(completion: @escaping (Bool) -> Void) {
    if #available(macOS 14.0, *) {
      eventStore.requestFullAccessToReminders { granted, _ in
        completion(granted)
      }
    } else {
      eventStore.requestAccess(to: .reminder) { granted, _ in
        completion(granted)
      }
    }
  }

  private func requestNotificationAccess(completion: @escaping (Bool) -> Void) {
    notificationCenter.requestAuthorization(options: [.alert, .sound]) { granted, _ in
      completion(granted)
    }
  }

  private func selectReminderCalendarIfNeeded(
    from window: NSWindow?,
    completion: @escaping (Bool) -> Void
  ) {
    if let selected = selectedCalendar, isICloudCalendar(selected) {
      completion(true)
      return
    }

    let candidates = eventStore.calendars(for: .reminder)
      .filter { $0.allowsContentModifications && isICloudCalendar($0) }
      .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
    if let defaultCalendar = eventStore.defaultCalendarForNewReminders(),
       candidates.contains(where: { $0.calendarIdentifier == defaultCalendar.calendarIdentifier }) {
      defaults.set(defaultCalendar.calendarIdentifier, forKey: calendarIdentifierKey)
      completion(true)
      return
    }
    guard !candidates.isEmpty else {
      completion(false)
      return
    }
    if candidates.count == 1 {
      defaults.set(candidates[0].calendarIdentifier, forKey: calendarIdentifierKey)
      completion(true)
      return
    }

    let picker = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 280, height: 30))
    candidates.forEach { picker.addItem(withTitle: $0.title) }
    let alert = NSAlert()
    alert.messageText = "选择 iCloud 提醒事项列表"
    alert.informativeText = "大王只会在所选列表中维护一条“每日 20:00 复习”提醒。"
    alert.accessoryView = picker
    alert.addButton(withTitle: "使用此列表")
    alert.addButton(withTitle: "仅使用 Mac 提醒")
    let response = window.map { alert.runModalSheet(for: $0) } ?? alert.runModal()
    guard response == .alertFirstButtonReturn else {
      completion(false)
      return
    }
    defaults.set(candidates[picker.indexOfSelectedItem].calendarIdentifier, forKey: calendarIdentifierKey)
    completion(true)
  }

  private var selectedCalendar: EKCalendar? {
    guard let identifier = defaults.string(forKey: calendarIdentifierKey) else {
      return nil
    }
    return eventStore.calendar(withIdentifier: identifier)
  }

  private func isICloudCalendar(_ calendar: EKCalendar) -> Bool {
    calendar.source.sourceType == .calDAV &&
      calendar.source.title.localizedCaseInsensitiveContains("icloud")
  }

  private func reconcileEventKitReminder(
    needsReview: Bool,
    completion: @escaping () -> Void
  ) {
    guard let calendar = selectedCalendar, isICloudCalendar(calendar) else {
      completion()
      return
    }
    fetchManagedReminders { [weak self] reminders in
      guard let self else {
        completion()
        return
      }
      let snapshots = reminders.map {
        DailyReminderSnapshot(
          identifier: $0.calendarItemIdentifier,
          dueDate: $0.dueDateComponents?.date
        )
      }
      let action = DailyReminderPolicy.reconcile(
        needsReview: needsReview,
        reminders: snapshots
      )
      let byIdentifier = Dictionary(
        uniqueKeysWithValues: reminders.map { ($0.calendarItemIdentifier, $0) }
      )
      for identifier in action.removeIdentifiers {
        if let duplicate = byIdentifier[identifier] {
          try? self.eventStore.remove(duplicate, commit: false)
        }
      }
      if action.shouldComplete,
         let identifier = action.keepIdentifier,
         let reminder = byIdentifier[identifier] {
        reminder.isCompleted = true
        reminder.completionDate = Date()
        try? self.eventStore.save(reminder, commit: false)
      } else if action.shouldCreate {
        let reminder = EKReminder(eventStore: self.eventStore)
        reminder.calendar = calendar
        reminder.title = "大王今日复习"
        reminder.notes = "完成今天已经安排的全部复习任务。"
        reminder.url = self.reminderMarker
        reminder.dueDateComponents = Calendar.current.dateComponents(
          [.calendar, .timeZone, .year, .month, .day, .hour, .minute],
          from: DailyReminderPolicy.nextEightPM(after: Date())
        )
        reminder.addRecurrenceRule(
          EKRecurrenceRule(recurrenceWith: .daily, interval: 1, end: nil)
        )
        try? self.eventStore.save(reminder, commit: false)
      }
      try? self.eventStore.commit()
      completion()
    }
  }

  private func fetchManagedReminders(completion: @escaping ([EKReminder]) -> Void) {
    let calendars = selectedCalendar.map { [$0] }
    let predicate = eventStore.predicateForIncompleteReminders(
      withDueDateStarting: nil,
      ending: nil,
      calendars: calendars
    )
    eventStore.fetchReminders(matching: predicate) { [weak self] reminders in
      guard let self else {
        completion([])
        return
      }
      completion((reminders ?? []).filter { $0.url == self.reminderMarker })
    }
  }

  private func scheduleMacNotification(needsReview: Bool) {
    notificationCenter.removePendingNotificationRequests(
      withIdentifiers: [localNotificationIdentifier]
    )
    guard needsReview else { return }
    notificationCenter.getNotificationSettings { [weak self] settings in
      guard let self,
            settings.authorizationStatus == .authorized ||
              settings.authorizationStatus == .provisional else {
        return
      }
      let content = UNMutableNotificationContent()
      content.title = "大王提醒你复习"
      content.body = "今天的复习计划还没完成，双击大王继续吧。"
      content.sound = .default
      let trigger = UNCalendarNotificationTrigger(
        dateMatching: Calendar.current.dateComponents(
          [.calendar, .timeZone, .year, .month, .day, .hour, .minute],
          from: DailyReminderPolicy.nextEightPM(after: Date())
        ),
        repeats: false
      )
      self.notificationCenter.add(
        UNNotificationRequest(
          identifier: self.localNotificationIdentifier,
          content: content,
          trigger: trigger
        )
      )
    }
  }

  private func showEnableResult(
    reminderAvailable: Bool,
    notificationAvailable: Bool,
    from window: NSWindow?
  ) {
    let message: String
    switch (reminderAvailable, notificationAvailable) {
    case (true, true):
      message = "已开启。iCloud 提醒事项会同步到 iPhone，Mac 也会在当天计划未完成时提醒。"
    case (true, false):
      message = "iCloud 提醒事项已开启并可同步到 iPhone；Mac 本地通知未获授权。"
    case (false, true):
      message = "目前仅使用 Mac 本地通知。未获得 iCloud 提醒事项权限或未找到可用的 iCloud 列表，电脑关机时 iPhone 无法收到提醒。"
    case (false, false):
      message = "没有获得提醒事项或通知权限，暂时无法发送每日提醒。可在“系统设置 > 隐私与安全性”中重新授权。"
    }
    showAlert(title: "每日提醒设置", message: message, from: window)
  }

  private func showAlert(title: String, message: String, from window: NSWindow?) {
    DispatchQueue.main.async {
      let alert = NSAlert()
      alert.messageText = title
      alert.informativeText = message
      alert.addButton(withTitle: "知道了")
      if let window {
        alert.beginSheetModal(for: window)
      } else {
        alert.runModal()
      }
    }
  }
}

private extension NSAlert {
  func runModalSheet(for window: NSWindow) -> NSApplication.ModalResponse {
    var response = NSApplication.ModalResponse.abort
    let semaphore = DispatchSemaphore(value: 0)
    beginSheetModal(for: window) {
      response = $0
      semaphore.signal()
    }
    while semaphore.wait(timeout: .now()) != .success {
      RunLoop.current.run(mode: .default, before: Date(timeIntervalSinceNow: 0.02))
    }
    return response
  }
}

func runDailyReviewReminderSelfTest() throws {
  let existing = DailyReminderSnapshot(
    identifier: "one",
    dueDate: Date(timeIntervalSince1970: 100)
  )
  let duplicate = DailyReminderSnapshot(
    identifier: "two",
    dueDate: Date(timeIntervalSince1970: 200)
  )
  guard DailyReminderPolicy.reconcile(needsReview: true, reminders: []).shouldCreate else {
    throw CodexPetSelfTestError(message: "An incomplete plan should create one reminder.")
  }
  let unchanged = DailyReminderPolicy.reconcile(needsReview: true, reminders: [existing])
  guard unchanged.keepIdentifier == "one",
        !unchanged.shouldCreate,
        !unchanged.shouldComplete else {
    throw CodexPetSelfTestError(message: "An existing reminder must be reused.")
  }
  let deduplicated = DailyReminderPolicy.reconcile(
    needsReview: true,
    reminders: [duplicate, existing]
  )
  guard deduplicated.keepIdentifier == "one",
        deduplicated.removeIdentifiers == ["two"],
        !deduplicated.shouldCreate else {
    throw CodexPetSelfTestError(message: "Duplicate managed reminders were not reconciled.")
  }
  let completed = DailyReminderPolicy.reconcile(needsReview: false, reminders: [existing])
  guard completed.shouldComplete, completed.keepIdentifier == "one" else {
    throw CodexPetSelfTestError(message: "A completed daily plan must complete today's reminder.")
  }

  var calendar = Calendar(identifier: .gregorian)
  calendar.timeZone = TimeZone(secondsFromGMT: 0)!
  let morning = calendar.date(from: DateComponents(
    year: 2026, month: 7, day: 25, hour: 9
  ))!
  let evening = calendar.date(from: DateComponents(
    year: 2026, month: 7, day: 25, hour: 21
  ))!
  let morningDue = calendar.dateComponents(
    [.year, .month, .day, .hour, .minute],
    from: DailyReminderPolicy.nextEightPM(after: morning, calendar: calendar)
  )
  let eveningDue = calendar.dateComponents(
    [.year, .month, .day, .hour, .minute],
    from: DailyReminderPolicy.nextEightPM(after: evening, calendar: calendar)
  )
  guard morningDue.day == 25,
        morningDue.hour == 20,
        eveningDue.day == 26,
        eveningDue.hour == 20 else {
    throw CodexPetSelfTestError(message: "The reminder time must resolve to the next local 20:00.")
  }
}

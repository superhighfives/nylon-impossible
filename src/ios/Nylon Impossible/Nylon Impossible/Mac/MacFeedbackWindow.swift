//
//  MacFeedbackWindow.swift
//  Nylon Impossible
//
//  Send feedback… on the Mac, for an admin: the menu bar window's footer
//  item (or ⇧⌘F while it's open) snapshots the menu bar window, closes it,
//  and opens the feedback form in a small window of its own, like Settings.
//  A sheet inside the menu bar window would vanish with it whenever it lost
//  focus, taking a half-typed report along. Once an issue is filed, the
//  menu bar window comes back with "Filed #N" and View, where the iPhone
//  shows it under the closed sheet.
//

#if os(macOS)
import AppKit
import SwiftUI

extension FeedbackService {
    /// Send feedback…'s shortcut while the menu bar window is open, as in the
    /// old Help menu. Not ⌥⌘F: that's Find and Replace.
    static let shortcut = (key: KeyEquivalent("f"), modifiers: EventModifiers([.command, .shift]))
}

/// The menu bar window as it looked when feedback was chosen.
struct MacFeedbackSnapshot {
    let image: CGImage
    let size: CGSize
    let colorScheme: ColorScheme

    /// `window`'s content as it looks now, at the screen's scale. Drawn from
    /// the view, so it needs no Screen Recording permission.
    @MainActor
    static func of(_ window: NSWindow?) -> MacFeedbackSnapshot? {
        guard let window, let view = window.contentView,
              let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return nil }
        view.cacheDisplay(in: view.bounds, to: rep)
        guard let image = rep.cgImage else { return nil }
        let isDark = window.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        return MacFeedbackSnapshot(image: image, size: view.bounds.size, colorScheme: isDark ? .dark : .light)
    }
}

enum MacFeedbackHandoff {
    /// Send feedback… in order: the snapshot first, while the menu bar window
    /// is still up, then close it, then open the form with the snapshot.
    @MainActor
    static func send(
        snapshot: () -> MacFeedbackSnapshot?,
        close: () -> Void,
        open: (MacFeedbackSnapshot?) -> Void
    ) {
        let taken = snapshot()
        close()
        open(taken)
    }
}

@MainActor
final class MacFeedbackWindow: NSObject, NSWindowDelegate {
    /// The issue's `screen`: the menu bar window is the whole Mac app.
    static let screen = "Menu bar"

    let feedback: FeedbackService
    private(set) var window: NSWindow?
    /// Brings the app forward first; see `MacWindowOpening`.
    var activate: () -> Void = { NSApp.activate(ignoringOtherApps: true) }
    /// An issue was just filed: bring the menu bar window back for "Filed #N".
    var onFiled: () -> Void = {}
    /// The synced appearance preference, read as the form draws, so it
    /// follows a change made while it's open.
    var theme: () -> String = { "system" }

    var isVisible: Bool { window?.isVisible ?? false }

    init(feedback: FeedbackService) {
        self.feedback = feedback
    }

    /// Open the form, in front, with `snapshot` attached. The form opens
    /// straight away; the returned task is the snapshot encoding.
    @discardableResult
    func show(snapshot: MacFeedbackSnapshot?) -> Task<Void, Never>? {
        feedback.screen = Self.screen
        if let snapshot { feedback.colorScheme = snapshot.colorScheme }
        feedback.present(viewport: snapshot?.size)
        let window = isVisible ? self.window : makeWindow()
        self.window = window
        MacWindowOpening.open(activate: activate) {
            window?.makeKeyAndOrderFront(nil)
        }
        guard let image = snapshot?.image else { return nil }
        let feedback = feedback
        return Task { await feedback.add(image) }
    }

    func close() {
        window?.close()
    }

    /// Closed with its close button: the draft stays for next time, as when
    /// the iPhone's sheet is swiped down.
    func windowWillClose(_ notification: Notification) {
        feedback.isPresented = false
    }

    /// Cancel, or sent: the form's close.
    func finish() {
        close()
        if feedback.lastFiled != nil { onFiled() }
    }

    private func makeWindow() -> NSWindow {
        let root = MacFeedbackRoot(feedback: feedback, theme: theme) { [weak self] in self?.finish() }
        let window = NSWindow(contentViewController: NSHostingController(rootView: root))
        window.title = "Send feedback"
        window.styleMask = [.titled, .closable, .resizable]
        // The form's ideal size (`FeedbackSheet`); the window opens smaller
        // than that on its own, cutting off what's sent with the report.
        window.setContentSize(NSSize(width: 560, height: 560))
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.center()
        return window
    }
}

/// The form in the app's appearance.
private struct MacFeedbackRoot: View {
    let feedback: FeedbackService
    let theme: () -> String
    let onClose: () -> Void

    var body: some View {
        FeedbackSheet(feedback: feedback, onClose: onClose)
            .preferredColorScheme(MacAppearance.colorScheme(for: theme()))
    }
}
#endif

//
//  ShareViewController+macOS.swift
//  Nylon Share
//
//  The macOS host for the share sheet — "Share → Nylon" from Safari's
//  toolbar, a Finder selection of text, or any app's Share menu. The system
//  presents the extension in a sheet attached to the sharing window; this
//  sizes it like a compact composer and hosts the same `ShareSheetView` and
//  `ShareExtensionLoader` the iOS extension uses.
//

#if os(macOS)
import AppKit
import SwiftUI

class ShareViewController: NSViewController {
    /// The sheet's size: the composer, its chips and the link row, with room
    /// for a few pasted lines.
    static let preferredSize = NSSize(width: 460, height: 380)

    private let loader = ShareExtensionLoader()

    override var nibName: NSNib.Name? { nil }

    override func loadView() {
        let view = NSView(frame: NSRect(origin: .zero, size: Self.preferredSize))
        view.wantsLayer = true
        self.view = view
        preferredContentSize = Self.preferredSize
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        Task { @MainActor in
            guard let shared = await loader.load(items) else {
                completeWithError()
                return
            }
            show(shared)
        }
    }

    private func show(_ shared: ShareExtensionLoader.Shared) {
        let shareView = ShareSheetView(
            text: shared.text,
            url: shared.url,
            suppliedTitle: shared.title,
            lists: loader.availableLists(),
            onSave: { [weak self] submission in
                self?.save(submission, shared: shared)
            },
            onCancel: { [weak self] in
                self?.cancel()
            }
        )
        let hosting = NSHostingView(rootView: shareView)
        hosting.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(hosting)
        NSLayoutConstraint.activate([
            hosting.topAnchor.constraint(equalTo: view.topAnchor),
            hosting.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hosting.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hosting.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func save(_ submission: ShareSheetView.Submission, shared: ShareExtensionLoader.Shared) {
        do {
            let created = try loader.save(submission, shared: shared)
            guard !created.isEmpty else { return }
        } catch {
            print("[ShareViewController] Failed to save share: \(error)")
            completeWithError()
            return
        }
        Haptics.lightImpact()
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }

    private func completeWithError() {
        let error = NSError(domain: ShareExtensionLoader.errorDomain, code: 0, userInfo: nil)
        extensionContext?.cancelRequest(withError: error)
    }

    private func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
    }
}
#endif

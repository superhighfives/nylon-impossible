//
//  ShareViewController.swift
//  Nylon Share
//
//  Created by Charlie Gleason on 3/4/26.
//
//  The iOS host for the share sheet. Reading the shared item, the lists and
//  saving all live in `ShareExtensionLoader`; the macOS host is in
//  ShareViewController+macOS.swift.
//

#if os(iOS)
import SwiftUI
import UIKit

class ShareViewController: UIViewController {
    private let loader = ShareExtensionLoader()

    override func viewDidLoad() {
        super.viewDidLoad()
        // The sheet's own colour, light and dark, so nothing flashes system
        // white while the shared item loads.
        view.backgroundColor = UIColor(Theme.Colors.canvas)
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

        let hostingController = UIHostingController(rootView: shareView)
        hostingController.view.backgroundColor = UIColor(Theme.Colors.canvas)
        addChild(hostingController)
        view.addSubview(hostingController.view)
        hostingController.view.translatesAutoresizingMaskIntoConstraints = false

        NSLayoutConstraint.activate([
            hostingController.view.topAnchor.constraint(equalTo: view.topAnchor),
            hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            hostingController.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        hostingController.didMove(toParent: self)
    }

    private func save(_ submission: ShareSheetView.Submission, shared: ShareExtensionLoader.Shared) {
        let created: [TodoItem]
        do {
            created = try loader.save(submission, shared: shared)
        } catch {
            // Nothing was persisted, so don't play the success haptic.
            print("[ShareViewController] Failed to save share: \(error)")
            completeWithError()
            return
        }
        guard !created.isEmpty else { return }

        // A light tap to say it landed, then out of the way. The short wait
        // lets the haptic play before the extension is torn down.
        Haptics.lightImpact()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
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

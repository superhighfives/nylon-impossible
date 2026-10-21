//
//  ShareViewController.swift
//  Nylon Share
//
//  Created by Charlie Gleason on 3/4/26.
//

import UIKit
import SwiftUI
import SwiftData
import UniformTypeIdentifiers

class ShareViewController: UIViewController {

    private var sharedURL: String?
    private var sharedTitle: String?

    /// One context for the extension's life: the list models handed to the
    /// composer belong to it, so it has to outlive the fetch.
    private lazy var context = ModelContext(SharedModelContainer.shared)

    override func viewDidLoad() {
        super.viewDidLoad()
        // The sheet's own colour, light and dark, so nothing flashes system
        // white while the shared item loads.
        view.backgroundColor = UIColor(Theme.Colors.canvas)
        processSharedContent()
    }

    private func processSharedContent() {
        guard let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] else {
            completeWithError()
            return
        }

        for item in extensionItems {
            guard let attachments = item.attachments else { continue }

            // Scan all providers first so a URL provider isn't missed because
            // a plain text provider (e.g. article title from Reeder) appears first.
            var urlProvider: NSItemProvider?
            var textProvider: NSItemProvider?

            for provider in attachments {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                    urlProvider = provider
                } else if textProvider == nil,
                          provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                    textProvider = provider
                }
            }

            if let urlProvider {
                // Prefer attributedContentText (e.g. article title from Reeder); fall back to
                // loading the plain-text provider when attributedContentText is nil or empty.
                let attributedTitle = item.attributedContentText?.string
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if let attributedTitle, !attributedTitle.isEmpty {
                    sharedTitle = attributedTitle
                    handleURL(provider: urlProvider)
                } else if let textProvider {
                    // Load the text provider first, then present the URL sheet with that title.
                    handleURLWithTextTitle(urlProvider: urlProvider, textProvider: textProvider)
                } else {
                    handleURL(provider: urlProvider)
                }
                return
            } else if let textProvider {
                handleText(provider: textProvider)
                return
            }
        }

        // No supported content found
        completeWithError()
    }

    private func handleURL(provider: NSItemProvider) {
        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, _ in
            guard let url = item as? URL else {
                DispatchQueue.main.async {
                    self?.completeWithError()
                }
                return
            }

            DispatchQueue.main.async {
                self?.showShareSheet(with: url.absoluteString, isURL: true)
            }
        }
    }

    private func handleURLWithTextTitle(urlProvider: NSItemProvider, textProvider: NSItemProvider) {
        textProvider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] item, _ in
            let title = (item as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            self?.sharedTitle = (title?.isEmpty == false) ? title : nil
            self?.handleURL(provider: urlProvider)
        }
    }

    private func handleText(provider: NSItemProvider) {
        provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] item, _ in
            guard let text = item as? String else {
                DispatchQueue.main.async {
                    self?.completeWithError()
                }
                return
            }

            DispatchQueue.main.async {
                self?.showShareSheet(with: text, isURL: false)
            }
        }
    }

    private func showShareSheet(with content: String, isURL: Bool) {
        if isURL {
            sharedURL = content
        }

        let shareView = ShareSheetView(
            text: isURL ? "" : content,
            url: sharedURL,
            suppliedTitle: sharedTitle,
            lists: availableLists(),
            onSave: { [weak self] submission in
                self?.save(submission)
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

    /// The signed-in user, from shared UserDefaults. Spelled out rather than
    /// via `BackgroundSyncService.userIdKey`: this target doesn't compile that
    /// service (it doesn't sync — the app picks the todo up on its next
    /// foreground sync), and pulling it in for one string constant would drag
    /// Config, KeychainHelper, APIError and the sync wire types along with it.
    private var currentUserId: String? {
        UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")?
            .string(forKey: "currentUserId")
    }

    /// Today, This Week, Someday, then the user's lists — the same order and
    /// names as the app's composer chips. Empty before the app's first sync,
    /// in which case the todo lands in Today server-side.
    private func availableLists() -> [TodoListModel] {
        let all = (try? context.fetch(FetchDescriptor<TodoListModel>())) ?? []
        let userId = currentUserId
        return all
            .filter { ($0.userId == userId || userId == nil) && (!$0.isSystem || $0.systemKind != nil) }
            .sorted { a, b in
                if a.isSystem != b.isSystem { return a.isSystem }
                if a.isSystem && b.isSystem { return a.systemSortIndex < b.systemSortIndex }
                return a.position < b.position
            }
    }

    private func save(_ submission: ShareSheetView.Submission) {
        let fallback = sharedURL.map { ShareCapture.fallbackTitle(url: $0, suppliedTitle: sharedTitle) }
        let created = ShareCapture.save(
            ShareCapture.Input(text: submission.text, sharedURL: sharedURL, fallbackTitle: fallback),
            listId: submission.listId,
            parseDates: submission.parseDates,
            userId: currentUserId,
            context: context
        )
        guard !created.isEmpty else { return }

        // A todo shared in with a due date can belong on the widget straight
        // away, and nothing else will prompt a reload until the app is opened.
        WidgetRefresh.reload()

        // A light tap to say it landed, then out of the way. The short wait
        // lets the haptic play before the extension is torn down.
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { [weak self] in
            self?.completeWithSuccess()
        }
    }

    private func completeWithSuccess() {
        extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
    }

    private func completeWithError() {
        let error = NSError(domain: "com.superhighfives.Nylon-Impossible.NylonShare", code: 0, userInfo: nil)
        extensionContext?.cancelRequest(withError: error)
    }

    private func cancel() {
        extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
    }
}

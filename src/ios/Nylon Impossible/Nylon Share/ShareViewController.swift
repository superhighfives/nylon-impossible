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

    override func viewDidLoad() {
        super.viewDidLoad()
        
        // Process the shared content
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
        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, error in
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
        provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] item, error in
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
            content: content,
            isURL: isURL,
            prefilledTitle: sharedTitle,
            lists: availableLists(),
            onSave: { [weak self] title, listId, parseDates in
                self?.saveTask(title: title, url: self?.sharedURL, listId: listId, parseDates: parseDates)
            },
            onCancel: { [weak self] in
                self?.cancel()
            }
        )
        
        let hostingController = UIHostingController(rootView: shareView)
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
    private func availableLists() -> [ShareList] {
        let context = ModelContext(SharedModelContainer.shared)
        let all = (try? context.fetch(FetchDescriptor<TodoListModel>())) ?? []
        let userId = currentUserId
        return all
            .filter { ($0.userId == userId || userId == nil) && (!$0.isSystem || $0.systemKind != nil) }
            .sorted { a, b in
                if a.isSystem != b.isSystem { return a.isSystem }
                if a.isSystem && b.isSystem { return a.systemSortIndex < b.systemSortIndex }
                return a.position < b.position
            }
            .map { ShareList(id: $0.id, name: $0.name) }
    }

    private func saveTask(title: String, url: String? = nil, listId: String?, parseDates: Bool) {
        let container = SharedModelContainer.shared
        let context = ModelContext(container)
        let userId = currentUserId
        let allTodos = TaskCreationService.fetchAllTodos(userId: userId, context: context)

        if let url = url {
            _ = TaskCreationService.createTaskWithURL(
                title: title,
                url: url,
                userId: userId,
                context: context,
                allTodos: allTodos,
                listId: listId,
                parseDate: parseDates
            )
        } else {
            _ = TaskCreationService.createTask(
                title: title,
                userId: userId,
                context: context,
                allTodos: allTodos,
                listId: listId,
                parseDate: parseDates
            )
        }

        // A task shared in with a due date can belong on the widget straight
        // away, and nothing else will prompt a reload until the app is opened.
        WidgetRefresh.reload()

        completeWithSuccess()
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

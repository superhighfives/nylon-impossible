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
                // Use the item's attributed text (e.g. article title from Reeder) as the
                // pre-filled task title so the user sees the real title, not just the domain.
                sharedTitle = item.attributedContentText?.string
                handleURL(provider: urlProvider)
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
            onSave: { [weak self] title in
                self?.saveTask(title: title, url: self?.sharedURL)
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
    
    private func saveTask(title: String, url: String? = nil) {
        let container = SharedModelContainer.shared
        let context = ModelContext(container)
        
        // Get userId from shared UserDefaults
        let userId = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")?
            .string(forKey: "currentUserId")
        
        let allTodos = TaskCreationService.fetchAllTodos(userId: userId, context: context)
        
        if let url = url {
            _ = TaskCreationService.createTaskWithURL(
                title: title,
                url: url,
                userId: userId,
                context: context,
                allTodos: allTodos
            )
        } else {
            _ = TaskCreationService.createTask(
                title: title,
                userId: userId,
                context: context,
                allTodos: allTodos
            )
        }
        
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

//
//  ShareExtensionLoader.swift
//  Nylon Share
//
//  Everything the share extension does that isn't hosting a view: reading
//  what was shared out of the extension context, the lists to offer, and
//  saving the result. The iOS `UIViewController` and the macOS
//  `NSViewController` are thin hosts around this and `ShareSheetView`, so
//  the two platforms can't drift.
//

import Foundation
import SwiftData
import UniformTypeIdentifiers

@MainActor
final class ShareExtensionLoader {
    /// What was shared, ready for the sheet.
    struct Shared: Equatable {
        /// Typed or shared text; empty for a link.
        let text: String
        /// The shared link, if one was shared.
        let url: String?
        /// A title the sharing app supplied with the link (Safari's page
        /// title, Reeder's article title).
        let title: String?
    }

    /// One context for the extension's life: the list models handed to the
    /// composer belong to it, so it has to outlive the fetch.
    private lazy var context = ModelContext(SharedModelContainer.shared)

    /// Pull a URL (preferred) or plain text out of the extension's items.
    /// Nil when there's nothing the sheet can use.
    func load(_ items: [NSExtensionItem]) async -> Shared? {
        for item in items {
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
                guard let url = await Self.loadURL(urlProvider) else { return nil }
                // Prefer attributedContentText (e.g. article title from Reeder); fall back to
                // the plain-text provider when attributedContentText is nil or empty.
                var title = Self.trimmed(item.attributedContentText?.string)
                if title == nil, let textProvider {
                    title = Self.trimmed(await Self.loadText(textProvider))
                }
                return Shared(text: "", url: url.absoluteString, title: title)
            } else if let textProvider {
                guard let text = await Self.loadText(textProvider) else { return nil }
                return Shared(text: text, url: nil, title: nil)
            }
        }
        return nil
    }

    /// Today, This week, Someday, then the user's lists — the same order and
    /// names as the app's composer chips. Empty before the app's first sync,
    /// in which case the todo lands in Today server-side.
    func availableLists() -> [TodoListModel] {
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

    /// Save the sheet's submission. Returns the todos created; throws when
    /// nothing could be persisted.
    func save(_ submission: ShareSheetView.Submission, shared: Shared) throws -> [TodoItem] {
        let fallback = shared.url.map { ShareCapture.fallbackTitle(url: $0, suppliedTitle: shared.title) }
        let created = try ShareCapture.save(
            ShareCapture.Input(text: submission.text, sharedURL: shared.url, fallbackTitle: fallback),
            listId: submission.listId,
            parseDates: submission.parseDates,
            userId: currentUserId,
            context: context
        )
        if !created.isEmpty {
            // A todo shared in with a due date can belong on the widget straight
            // away, and nothing else will prompt a reload until the app is opened.
            WidgetRefresh.reload()
            StoreChangeSignal.post()
        }
        return created
    }

    /// The signed-in user, from shared UserDefaults. Spelled out rather than
    /// via `BackgroundSyncService.userIdKey`: this target doesn't compile that
    /// service (it doesn't sync — the app picks the todo up on its next
    /// foreground sync), and pulling it in for one string constant would drag
    /// Config, KeychainHelper, APIError and the sync wire types along with it.
    private var currentUserId: String? {
        AppGroup.defaults?.string(forKey: "currentUserId")
    }

    static let errorDomain = "com.superhighfives.Nylon-Impossible.NylonShare"

    // MARK: - Providers

    private static func trimmed(_ text: String?) -> String? {
        let value = text?.trimmingCharacters(in: .whitespacesAndNewlines)
        return value?.isEmpty == false ? value : nil
    }

    private static func loadURL(_ provider: NSItemProvider) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                // Safari on macOS hands over the URL's bytes rather than a URL.
                if let url = item as? URL {
                    continuation.resume(returning: url)
                } else if let data = item as? Data {
                    continuation.resume(returning: URL(dataRepresentation: data, relativeTo: nil))
                } else if let string = item as? String {
                    continuation.resume(returning: URL(string: string))
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private static func loadText(_ provider: NSItemProvider) async -> String? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
                if let text = item as? String {
                    continuation.resume(returning: text)
                } else if let data = item as? Data {
                    continuation.resume(returning: String(data: data, encoding: .utf8))
                } else if let attributed = item as? NSAttributedString {
                    continuation.resume(returning: attributed.string)
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }
}

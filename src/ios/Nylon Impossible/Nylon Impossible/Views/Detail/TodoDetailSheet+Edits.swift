//
//  TodoDetailSheet+Edits.swift
//  Nylon Impossible
//
//  The detail sheet's writes: due, repeat, debounced sync, and the link
//  menu's network calls.
//

import SwiftData
import SwiftUI

extension TodoDetailSheet {
    // MARK: - Edits

    func setDue(_ date: Date?) {
        actions.setDue(todo, date)
    }

    func setRepeat(_ frequency: RecurrenceFrequency?) {
        if frequency != nil, todo.dueDate == nil {
            todo.dueDate = DueLabel.inDays(0)
        }
        todo.recurrence = frequency.map { Recurrence(frequency: $0) }
        todo.markModified()
        actions.edited()
    }

    /// Typing saves locally on every change; the sync waits for a pause.
    func scheduleSync() {
        pendingSync?.cancel()
        pendingSync = Task {
            try? await Task.sleep(for: .milliseconds(800))
            guard !Task.isCancelled else { return }
            actions.edited()
            pendingSync = nil
        }
    }

    func flushEdits() {
        guard let pendingSync else { return }
        pendingSync.cancel()
        self.pendingSync = nil
        actions.edited()
    }

    // MARK: - Links (network)

    var todoId: String { todo.id.uuidString.lowercased() }

    func loadUrls() async {
        guard let apiService, todo.userId != nil else { return }
        do {
            urls = try await apiService.getTodo(id: todo.id).urls
        } catch {
            // Links are supplementary; the local copy stays on screen.
        }
    }

    func setShowPreview(_ url: APITodoUrl, _ showPreview: Bool) async {
        guard let apiService else { return linkUnavailable() }
        do {
            try await apiService.updateTodoUrl(todoId: todoId, urlId: url.id, showPreview: showPreview)
            todo.urls.first { $0.id == url.id }?.showPreview = showPreview
            await loadUrls()
        } catch {
            actions.toasts.show("Couldn’t change the link", action: nil)
        }
    }

    func retryLinks() async {
        guard let apiService else { return linkUnavailable() }
        do {
            guard try await apiService.processTodo(todoId: todoId) > 0 else { return }
            await loadUrls()
            // Fetching runs in the background server-side; come back once
            // for the result, and let the next sync bring anything slower.
            try? await Task.sleep(for: .seconds(3))
            await loadUrls()
        } catch {
            actions.toasts.show("Couldn’t retry the link", action: nil)
        }
    }

    func remove(_ url: APITodoUrl) async {
        // A card still on its way exists only here: drop it, and `addLink`
        // deletes the saved copy when the request comes back.
        if url.id.hasPrefix("pending-") {
            withAnimation(Theme.Motion.easeOutStrong(Theme.Motion.base)) {
                urls.removeAll { $0.id == url.id }
            }
            return
        }
        guard let apiService else { return linkUnavailable() }
        do {
            try await apiService.deleteTodoUrl(todoId: todoId, urlId: url.id)
            withAnimation(Theme.Motion.easeOutStrong(Theme.Motion.base)) {
                urls.removeAll { $0.id == url.id }
            }
            if let stored = todo.urls.first(where: { $0.id == url.id }) {
                modelContext.delete(stored)
                try? modelContext.save()
            }
        } catch {
            actions.toasts.show("Couldn’t remove the link", action: nil)
        }
    }

    /// "Paste a link": checked here first (the API applies the same rule),
    /// shown at once as a pending card, then swapped for the server's copy;
    /// its title arrives once the background fetch does.
    func addLink() async {
        guard !newLink.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        guard let href = LinkInput.normalize(newLink) else {
            linkInvalid = true
            // Keep the field, so the text can be fixed straight away.
            focus = .link
            AccessibilityNotification.Announcement("That doesn’t look like a link.").post()
            return
        }
        newLink = ""
        focus = .link
        // Already there: its card is on screen.
        guard !urls.contains(where: { $0.url == href }) else { return }
        guard let apiService else { return linkUnavailable() }
        let now = Date()
        let pending = APITodoUrl(
            id: "pending-\(UUID().uuidString)", todoId: todoId, url: href, title: nil, description: nil,
            siteName: nil, favicon: nil, image: nil, showPreview: true,
            position: (urls.map(\.position).max() ?? "a0") + "V", fetchStatus: .pending,
            fetchedAt: nil, createdAt: now, updatedAt: now
        )
        withAnimation(Theme.Motion.easeOutStrong(Theme.Motion.base)) { urls.append(pending) }
        do {
            let added = try await apiService.addTodoUrl(todoId: todoId, url: href)
            guard let index = urls.firstIndex(where: { $0.id == pending.id }) else {
                // Removed while it was on its way: take the saved one back
                // out, or it would reappear at the next refresh.
                try? await apiService.deleteTodoUrl(todoId: todoId, urlId: added.id)
                return
            }
            urls[index] = added
            actions.edited()
            // The title is fetched server-side; come back once for it (unless
            // the detail has gone), and let the next sync bring anything
            // slower.
            guard (try? await Task.sleep(for: .seconds(3))) != nil else { return }
            await loadUrls()
        } catch {
            withAnimation(Theme.Motion.easeOutStrong(Theme.Motion.base)) {
                urls.removeAll { $0.id == pending.id }
            }
            actions.toasts.show("Couldn’t add the link", action: nil)
        }
    }

    func linkUnavailable() {
        actions.toasts.show("Links need a connection", action: nil)
    }
}

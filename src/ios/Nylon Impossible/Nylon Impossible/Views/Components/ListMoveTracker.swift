//
//  ListMoveTracker.swift
//  Nylon Impossible
//
//  Makes a todo changing lists legible on the page you're looking at.
//
//  The server's aging sweep (src/api/src/lib/list-sweep.ts) demotes Today's
//  incomplete todos into This Week at the user's local midnight, so the first
//  refresh after that quietly drops rows out of the Today page — they're gone
//  before you can see where they went. The same is true of a manual move from
//  the edit sheet's list picker, and of any move made on another device.
//
//  This tracks those crossings for one list page: a row that left is held in
//  its slot for a beat, labelled with the list it went to, before it slides
//  away; a row that landed here from elsewhere is flagged so it can be washed
//  in brand colour until it's been seen. It owns only the timing — the page
//  (`ListPageView`) decides what to keep rendering, and the row styling lives
//  in `TaskListView`.
//

import Foundation
import SwiftUI

@Observable
final class ListMoveTracker {
    /// The ids this page should render, as of the last reconcile. Deliberately
    /// lags the page's own todos: SwiftUI evaluates `body` with the new set
    /// *before* `onChange` runs, so a row a sync just moved would blink out for
    /// a frame if the page only held on to what the tracker had already
    /// classified as departing. Keeping last-known membership means a row never
    /// leaves early — it leaves when its exit says so.
    private(set) var retained: Set<UUID> = []

    /// Todos that left this page for another list, mapped to that list's name.
    /// Always a subset of `retained` — the page keeps rendering each one,
    /// looked up from the unscoped todo set since the todo itself still
    /// exists, until the exit finishes.
    private(set) var departures: [UUID: String] = [:]

    /// Todos that landed on this page from another list, still to be seen.
    /// Cleared together once the page has been visible for `accentDuration`.
    private(set) var arrivals: Set<UUID> = []

    /// The animation a row leaves or lands on. Also what the page applies to
    /// its rendered set (`ListPageView`) — an `.animation(_:value:)` overrides
    /// the transaction the tracker's own `withAnimation` sets up, so the two
    /// have to agree or the exit runs at a duration nobody chose.
    static let membershipAnimation: Animation = .easeInOut(duration: 0.35)

    /// How long a departing row keeps its slot, labelled, before sliding out.
    private static let holdDuration: Duration = .milliseconds(900)
    /// How long an arrival stays washed in brand colour once it's on screen.
    private static let accentDuration: Duration = .milliseconds(1600)
    /// A todo created within this window is a fresh add, not a move — it slid
    /// in from the input bar and shouldn't be dressed up as having travelled.
    private static let freshCreateWindow: TimeInterval = 10
    /// How recently a todo must have changed lists for landing here to count as
    /// an arrival. `listEnteredAt` is stamped by the sync that moved it, so a
    /// row that has simply been sitting in this list falls outside it.
    private static let arrivalWindow: TimeInterval = 60

    private var exitTasks: [UUID: Task<Void, Never>] = [:]
    private var accentTask: Task<Void, Never>?
    /// Whether the page has settled on a set of todos to call "what was already
    /// here". Until it has, everything showing up is the store loading rather
    /// than todos moving in, and washing the whole list brand-yellow on first
    /// launch is exactly the noise this is meant to avoid.
    private var hasBaseline = false

    /// Record the page's starting state, so its *first* change is diffable too.
    /// A page that renders with todos already in it is also its own baseline;
    /// an empty one has to wait for its first change (the initial load) to know
    /// what "already here" means.
    @MainActor
    func establishBaseline(ids: [UUID]) {
        guard retained.isEmpty else { return }
        retained = Set(ids)
        hasBaseline = hasBaseline || !ids.isEmpty
    }

    /// Reconcile a change in this page's todos.
    ///
    /// - Parameters:
    ///   - previousIds: the page's todo ids before the change.
    ///   - currentIds: its ids after.
    ///   - allTodos: every todo, unscoped — a todo that moved is still in here
    ///     under a different `listKey`, which is what separates a move from a
    ///     delete.
    ///   - lists: the lists a todo could have moved to, for the chip's label.
    ///   - listId: this page's own list.
    @MainActor
    func reconcile(
        previousIds: [UUID],
        currentIds: [UUID],
        allTodos: [TodoItem],
        lists: [TodoListModel],
        listId: String
    ) {
        let previous = Set(previousIds)
        let current = Set(currentIds)
        guard previous != current else { return }

        let byId = Dictionary(allTodos.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let page = listId.lowercased()

        for id in previous.subtracting(current) {
            // Only a move earns the treatment. A todo that was deleted is gone
            // from `allTodos` (hard delete on sync) or flagged `isDeleted`, and
            // completing one keeps it on this page in the Completed section —
            // neither should read as having gone somewhere.
            guard let todo = byId[id],
                  !todo.isDeleted,
                  let destination = todo.listKey?.lowercased(),
                  destination != page,
                  let list = lists.first(where: { $0.id.lowercased() == destination })
            else { continue }
            depart(id, to: list.name)
        }

        let returned = current.subtracting(previous)

        // A todo can come straight back — an undone move, or a conflicting
        // edit resolving the other way — while its exit is still running.
        // Cancel it so the row settles in place instead of sliding out of a
        // list it's once again part of. Unconditional: whether the return is
        // worth accenting is a separate question, answered below.
        for id in returned where departures[id] != nil {
            cancelDeparture(id)
        }

        if hasBaseline {
            let now = Date()
            for id in returned {
                guard let todo = byId[id],
                      now.timeIntervalSince(todo.createdAt) > Self.freshCreateWindow,
                      let enteredAt = todo.listEnteredAt,
                      now.timeIntervalSince(enteredAt) < Self.arrivalWindow
                else { continue }
                arrive(id)
            }
        }

        // Everything on the page now, plus whatever is still on its way out.
        // Anything else — deleted, or moved somewhere this page can't name —
        // drops out here rather than lingering.
        retained = current.union(departures.keys)
        hasBaseline = true
    }

    /// Start (or restart) the accent countdown once this page is on screen.
    /// Arrivals found while the page was off screen — the sweep lands on This
    /// Week while you're still looking at Today — wait here rather than timing
    /// out unseen behind the pager.
    @MainActor
    func pageBecameVisible() {
        guard !arrivals.isEmpty, accentTask == nil else { return }
        accentTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: Self.accentDuration)
            guard let self, !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.5)) {
                self.arrivals.removeAll()
            }
            self.accentTask = nil
        }
    }

    @MainActor
    private func depart(_ id: UUID, to listName: String) {
        exitTasks[id]?.cancel()
        withAnimation(.easeOut(duration: 0.2)) {
            departures[id] = listName
        }
        exitTasks[id] = Task { @MainActor [weak self] in
            try? await Task.sleep(for: Self.holdDuration)
            guard let self, !Task.isCancelled else { return }
            withAnimation(Self.membershipAnimation) {
                self.departures.removeValue(forKey: id)
                self.retained.remove(id)
            }
            self.exitTasks[id] = nil
        }
    }

    @MainActor
    private func cancelDeparture(_ id: UUID) {
        exitTasks[id]?.cancel()
        exitTasks[id] = nil
        withAnimation(.easeOut(duration: 0.2)) {
            departures.removeValue(forKey: id)
        }
    }

    @MainActor
    private func arrive(_ id: UUID) {
        withAnimation(.easeOut(duration: 0.2)) {
            _ = arrivals.insert(id)
        }
    }
}

/// "→ This Week" — where a row that just left this page went. Rides the row's
/// trailing edge for the beat before it slides away, so the move is readable
/// even though the destination is a page-swipe away.
struct MovingToListChip: View {
    let listName: String

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "arrow.right")
                .font(.system(size: 10, weight: .bold))
            Text(listName)
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
        }
        .foregroundStyle(Color.appBrandForeground)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color.appBrand, in: Capsule())
        .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
        .accessibilityLabel("Moved to \(listName)")
    }
}

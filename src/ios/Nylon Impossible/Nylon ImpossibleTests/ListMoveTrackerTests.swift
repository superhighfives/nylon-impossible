import Testing
import Foundation
@testable import Nylon_Impossible

@Suite("ListMoveTracker")
@MainActor
struct ListMoveTrackerTests {
    private let today = "today-id"
    private let thisWeek = "week-id"

    private var lists: [TodoListModel] {
        [
            TodoListModel(
                id: today, userId: "user", name: "Today",
                kind: "system", systemKind: .today, position: "a0"
            ),
            TodoListModel(
                id: thisWeek, userId: "user", name: "This Week",
                kind: "system", systemKind: .thisWeek, position: "a1"
            )
        ]
    }

    /// A todo that has been around a while — old enough not to be mistaken for
    /// something just typed into the add bar.
    private func settledTodo(title: String, in listId: String) -> TodoItem {
        let todo = TodoItem(title: title)
        todo.createdAt = Date().addingTimeInterval(-3600)
        todo.listKey = listId
        todo.listEnteredAt = Date().addingTimeInterval(-3600)
        return todo
    }

    // MARK: - Departures

    @Test("a todo swept into another list departs, labelled with where it went")
    func departsOnListChange() {
        let tracker = ListMoveTracker()
        let todo = settledTodo(title: "Water the plants", in: today)
        tracker.establishBaseline(ids: [todo.id])

        // The midnight sweep demotes it; the Today page loses it.
        todo.listKey = thisWeek
        todo.listEnteredAt = Date()
        tracker.reconcile(
            previousIds: [todo.id], currentIds: [],
            allTodos: [todo], lists: lists, listId: today
        )

        #expect(tracker.departures[todo.id] == "This Week")
        // Still rendered — the row holds its slot until the exit finishes.
        #expect(tracker.retained.contains(todo.id))
    }

    @Test("a todo deleted on another client does not depart")
    func deletedTodoDoesNotDepart() {
        let tracker = ListMoveTracker()
        let todo = settledTodo(title: "Gone", in: today)
        tracker.establishBaseline(ids: [todo.id])

        // Sync hard-deletes what the server no longer returns.
        tracker.reconcile(
            previousIds: [todo.id], currentIds: [],
            allTodos: [], lists: lists, listId: today
        )

        #expect(tracker.departures.isEmpty)
        #expect(!tracker.retained.contains(todo.id))
    }

    @Test("a soft-deleted todo does not depart")
    func softDeletedTodoDoesNotDepart() {
        let tracker = ListMoveTracker()
        let todo = settledTodo(title: "Deleted here", in: today)
        tracker.establishBaseline(ids: [todo.id])

        todo.isDeleted = true
        tracker.reconcile(
            previousIds: [todo.id], currentIds: [],
            allTodos: [todo], lists: lists, listId: today
        )

        #expect(tracker.departures.isEmpty)
        #expect(!tracker.retained.contains(todo.id))
    }

    @Test("a move into a list this page can't name is not dressed up as one")
    func unknownDestinationDoesNotDepart() {
        let tracker = ListMoveTracker()
        let todo = settledTodo(title: "Off to a custom list", in: today)
        tracker.establishBaseline(ids: [todo.id])

        todo.listKey = "some-list-not-loaded"
        tracker.reconcile(
            previousIds: [todo.id], currentIds: [],
            allTodos: [todo], lists: lists, listId: today
        )

        #expect(tracker.departures.isEmpty)
        #expect(!tracker.retained.contains(todo.id))
    }

    @Test("a todo that comes straight back cancels its exit")
    func returningTodoCancelsDeparture() {
        let tracker = ListMoveTracker()
        let todo = settledTodo(title: "Undo me", in: today)
        tracker.establishBaseline(ids: [todo.id])

        todo.listKey = thisWeek
        tracker.reconcile(
            previousIds: [todo.id], currentIds: [],
            allTodos: [todo], lists: lists, listId: today
        )
        #expect(tracker.departures[todo.id] != nil)

        todo.listKey = today
        tracker.reconcile(
            previousIds: [], currentIds: [todo.id],
            allTodos: [todo], lists: lists, listId: today
        )

        #expect(tracker.departures.isEmpty)
        #expect(tracker.retained.contains(todo.id))
    }

    // MARK: - Arrivals

    @Test("the first load of an empty page is not a set of arrivals")
    func initialLoadIsNotAnArrival() {
        let tracker = ListMoveTracker()
        let first = settledTodo(title: "First", in: thisWeek)
        let second = settledTodo(title: "Second", in: thisWeek)
        first.listEnteredAt = Date()
        second.listEnteredAt = Date()
        // A cold start: the page renders empty, then the store loads.
        tracker.establishBaseline(ids: [])

        tracker.reconcile(
            previousIds: [], currentIds: [first.id, second.id],
            allTodos: [first, second], lists: lists, listId: thisWeek
        )

        #expect(tracker.arrivals.isEmpty)
    }

    @Test("a todo swept in from another list is flagged as having arrived")
    func sweptInTodoArrives() {
        let tracker = ListMoveTracker()
        let sitting = settledTodo(title: "Already here", in: thisWeek)
        let swept = settledTodo(title: "Demoted from Today", in: thisWeek)
        swept.listEnteredAt = Date()
        tracker.establishBaseline(ids: [sitting.id])

        tracker.reconcile(
            previousIds: [sitting.id], currentIds: [sitting.id, swept.id],
            allTodos: [sitting, swept], lists: lists, listId: thisWeek
        )

        #expect(tracker.arrivals == [swept.id])
    }

    @Test("a todo just typed into the add bar is not flagged as having arrived")
    func freshlyCreatedTodoDoesNotArrive() {
        let tracker = ListMoveTracker()
        let sitting = settledTodo(title: "Already here", in: thisWeek)
        let created = TodoItem(title: "Just typed")
        created.listKey = thisWeek
        created.listEnteredAt = Date()
        tracker.establishBaseline(ids: [sitting.id])

        tracker.reconcile(
            previousIds: [sitting.id], currentIds: [sitting.id, created.id],
            allTodos: [sitting, created], lists: lists, listId: thisWeek
        )

        #expect(tracker.arrivals.isEmpty)
    }

    @Test("a todo that has been sitting in this list is not flagged as having arrived")
    func longSettledTodoDoesNotArrive() {
        let tracker = ListMoveTracker()
        let sitting = settledTodo(title: "Already here", in: thisWeek)
        // Loaded in late (a paged-in sync), but it entered this list days ago.
        let late = settledTodo(title: "Here since Tuesday", in: thisWeek)
        late.listEnteredAt = Date().addingTimeInterval(-3 * 24 * 60 * 60)
        tracker.establishBaseline(ids: [sitting.id])

        tracker.reconcile(
            previousIds: [sitting.id], currentIds: [sitting.id, late.id],
            allTodos: [sitting, late], lists: lists, listId: thisWeek
        )

        #expect(tracker.arrivals.isEmpty)
    }
}

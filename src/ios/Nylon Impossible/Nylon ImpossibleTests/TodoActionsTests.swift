import Foundation
import SwiftData
import Testing
@testable import Nylon_Impossible

@MainActor
@Suite("TodoActions (done, undo, delete, move, add)")
struct TodoActionsTests {
    private struct Fixture {
        let container: ModelContainer
        let context: ModelContext
        let actions: TodoActions
        let today: TodoListModel
        let week: TodoListModel
        var mutations: () -> Int
    }

    private func makeFixture() throws -> Fixture {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: TodoItem.self, TodoUrl.self, TodoListModel.self, configurations: config)
        let context = container.mainContext
        let today = TodoListModel(id: "today", userId: "u1", name: "Today", kind: "system", systemKind: .today)
        let week = TodoListModel(id: "thisweek", userId: "u1", name: "This Week", kind: "system", systemKind: .thisWeek)
        let someday = TodoListModel(id: "someday", userId: "u1", name: "Someday", kind: "system", systemKind: .someday)
        [today, week, someday].forEach(context.insert)
        let actions = TodoActions()
        actions.reduceMotion = true
        actions.toasts.duration = .seconds(60)
        final class Counter { var value = 0 }
        let counter = Counter()
        actions.configure(context: context) { counter.value += 1 }
        return Fixture(
            container: container, context: context, actions: actions,
            today: today, week: week, mutations: { counter.value }
        )
    }

    private func insert(_ title: String, in list: TodoListModel, _ fixture: Fixture, position: String = "a0") -> TodoItem {
        let todo = TodoItem(title: title, userId: "u1", position: position)
        todo.listKey = list.id
        fixture.context.insert(todo)
        return todo
    }

    @Test("done marks the todo done, unpins it, and toasts Done with Undo")
    func doneToasts() throws {
        let fixture = try makeFixture()
        let todo = insert("Water the plants", in: fixture.today, fixture)
        todo.pinned = true

        fixture.actions.commitDone(todo)

        #expect(todo.isCompleted)
        #expect(!todo.pinned)
        #expect(fixture.actions.toasts.current?.text == "Done")
        #expect(fixture.actions.toasts.current?.actionLabel == "Undo")
        #expect(fixture.mutations() == 1)
    }

    @Test("Undo restores done, pin, position and subtasks exactly")
    func undoRestores() throws {
        let fixture = try makeFixture()
        let todo = insert("Plan trip", in: fixture.today, fixture, position: "a5")
        todo.pinned = true
        let doneChild = TodoItem(title: "Flights", userId: "u1")
        doneChild.parentId = todo.id
        doneChild.isCompleted = true
        let openChild = TodoItem(title: "Hotel", userId: "u1")
        openChild.parentId = todo.id
        fixture.context.insert(doneChild)
        fixture.context.insert(openChild)

        fixture.actions.commitDone(todo)
        #expect(openChild.isCompleted)

        fixture.actions.toasts.performAction()

        #expect(!todo.isCompleted)
        #expect(todo.pinned)
        #expect(todo.position == "a5")
        #expect(doneChild.isCompleted)
        #expect(!openChild.isCompleted)
        #expect(fixture.actions.toasts.current == nil)
    }

    @Test("a repeat stays open, advances, and toasts when it repeats")
    func repeatAdvances() throws {
        let fixture = try makeFixture()
        let todo = insert("Water the plants", in: fixture.today, fixture)
        let dueToday = DueLabel.inDays(0)
        todo.dueDate = dueToday
        todo.recurrence = Recurrence(frequency: .daily)

        fixture.actions.commitDone(todo)

        #expect(!todo.isCompleted)
        #expect(todo.dueDate == DueLabel.inDays(1))
        // Due tomorrow still places in Today, the list it was in.
        #expect(todo.listKey == fixture.today.id)
        #expect(fixture.actions.toasts.current?.text == "Done · next Tomorrow")

        fixture.actions.toasts.performAction()
        #expect(todo.dueDate == dueToday)
        #expect(todo.completedAt == nil)
    }

    @Test("a repeat placed in another list names it in the toast, and Undo puts it back")
    func repeatMovesList() throws {
        let fixture = try makeFixture()
        let todo = insert("Water the plants", in: fixture.today, fixture)
        todo.dueDate = DueLabel.inDays(0)
        todo.recurrence = Recurrence(frequency: .weekly)

        fixture.actions.commitDone(todo)

        // A week out places in This Week.
        #expect(todo.listKey == fixture.week.id)
        let label = DueLabel.text(for: DueLabel.inDays(7)).text
        #expect(fixture.actions.toasts.current?.text == "Done · next \(label), in This Week")

        fixture.actions.toasts.performAction()
        #expect(todo.listKey == fixture.today.id)
        #expect(todo.dueDate == DueLabel.inDays(0))
    }

    @Test("checking a repeat already done today completes the next occurrence")
    func repeatTwice() throws {
        let fixture = try makeFixture()
        let todo = insert("Stretch", in: fixture.today, fixture)
        todo.dueDate = DueLabel.inDays(0)
        todo.recurrence = Recurrence(frequency: .daily)

        fixture.actions.commitDone(todo)
        fixture.actions.commitDone(todo)

        #expect(todo.dueDate == DueLabel.inDays(2))
    }

    @Test("a repeat done today keeps its row; an ordinary done todo leaves")
    func pageRows() throws {
        let fixture = try makeFixture()
        let repeating = insert("Stretch", in: fixture.today, fixture, position: "a1")
        repeating.dueDate = DueLabel.inDays(0)
        repeating.recurrence = Recurrence(frequency: .daily)
        let plain = insert("Email", in: fixture.today, fixture, position: "a2")

        fixture.actions.commitDone(repeating)
        fixture.actions.commitDone(plain)

        let rows = fixture.actions.viewModel.pageTodos(from: fixture.actions.allTodos(), listId: "today")
        #expect(rows.map(\.title) == ["Stretch"])
    }

    @Test("delete hides at once and only deletes when the toast goes")
    func deferredDelete() throws {
        let fixture = try makeFixture()
        let todo = insert("Renew passport", in: fixture.week, fixture)

        fixture.actions.delete(todo)
        #expect(fixture.actions.pendingDeletes.contains(todo.id))
        #expect(!todo.isSoftDeleted)
        let rows = fixture.actions.viewModel.pageTodos(
            from: fixture.actions.allTodos(), listId: "thisweek", hidden: fixture.actions.pendingDeletes
        )
        #expect(rows.isEmpty)

        fixture.actions.toasts.expire()
        #expect(todo.isSoftDeleted)
        #expect(!todo.isSynced)
        #expect(fixture.actions.pendingDeletes.isEmpty)
    }

    @Test("Undo on a delete keeps the todo")
    func undoDelete() throws {
        let fixture = try makeFixture()
        let todo = insert("Renew passport", in: fixture.week, fixture)

        fixture.actions.delete(todo)
        fixture.actions.toasts.performAction()
        fixture.actions.toasts.expire()

        #expect(!todo.isSoftDeleted)
        #expect(fixture.actions.pendingDeletes.isEmpty)
    }

    @Test("a second toast commits the first one's delete")
    func replacingCommits() throws {
        let fixture = try makeFixture()
        let first = insert("One", in: fixture.today, fixture)
        let second = insert("Two", in: fixture.today, fixture)

        fixture.actions.delete(first)
        fixture.actions.commitDone(second)

        #expect(first.isSoftDeleted)
        #expect(fixture.actions.toasts.current?.text == "Done")
    }

    @Test("move goes to the end of the target list and Undo moves it back")
    func moveAndUndo() throws {
        let fixture = try makeFixture()
        _ = insert("Already there", in: fixture.week, fixture, position: "a3")
        let todo = insert("Send invoice", in: fixture.today, fixture, position: "a1")

        fixture.actions.move(todo, toList: fixture.week.id)
        #expect(todo.listKey == fixture.week.id)
        #expect(todo.position > "a3")
        #expect(fixture.actions.toasts.current?.text == "Moved to This Week")

        fixture.actions.toasts.performAction()
        #expect(todo.listKey == fixture.today.id)
        #expect(todo.position == "a1")
    }

    @Test("moving to the list it's in does nothing")
    func moveNoop() throws {
        let fixture = try makeFixture()
        let todo = insert("Stay", in: fixture.today, fixture)
        fixture.actions.move(todo, toList: "TODAY")
        #expect(fixture.actions.toasts.current == nil)
        #expect(fixture.mutations() == 0)
    }

    @Test("restoring from Done history puts it back in its list")
    func restoreFromDone() throws {
        let fixture = try makeFixture()
        let todo = insert("Pick up dry cleaning", in: fixture.week, fixture)
        todo.isCompleted = true

        fixture.actions.restoreFromDone(todo)

        #expect(!todo.isCompleted)
        #expect(todo.listKey == fixture.week.id)
        #expect(fixture.actions.toasts.current?.text == "Back in This Week")
    }

    @Test("a pasted list adds one todo per line, in order, with typed dates")
    func addLines() throws {
        let fixture = try makeFixture()
        let created = fixture.actions.add(
            draft: "Parmesan\nCoffee beans tomorrow\n\nOat milk",
            to: fixture.today.id,
            parseDates: true,
            userId: "u1"
        )
        #expect(created.map(\.title) == ["Parmesan", "Coffee beans", "Oat milk"])
        #expect(created[1].dueDate == DueLabel.inDays(1))
        let rows = fixture.actions.viewModel.pageTodos(from: fixture.actions.allTodos(), listId: "today")
        #expect(rows.map(\.title) == ["Parmesan", "Coffee beans", "Oat milk"])
    }

    @Test("× keeps the date words in the title")
    func addKeepsWords() throws {
        let fixture = try makeFixture()
        let created = fixture.actions.add(draft: "Call Mum about Sunday", to: fixture.today.id, parseDates: false, userId: "u1")
        #expect(created.first?.title == "Call Mum about Sunday")
        #expect(created.first?.dueDate == nil)
    }

    @Test("overlong text keeps its words in notes")
    func addLong() throws {
        let fixture = try makeFixture()
        let long = String(repeating: "lorem ", count: 120)
        let created = fixture.actions.add(draft: long, to: fixture.today.id, parseDates: true, userId: "u1")
        #expect(created.first?.itemNotes == long.trimmingCharacters(in: .whitespaces))
    }

    @Test("a second tap during the hold cancels it")
    func holdCancels() async throws {
        let fixture = try makeFixture()
        let todo = insert("Maybe", in: fixture.today, fixture)
        fixture.actions.holdDuration = .milliseconds(50)

        let hold = fixture.actions.toggleDone(todo)
        #expect(fixture.actions.isChecked(todo))
        #expect(fixture.actions.toggleDone(todo) == nil)
        // The cancelled hold runs to its end without committing.
        await hold?.value

        #expect(!todo.isCompleted)
        #expect(!fixture.actions.isChecked(todo))
    }

    @Test("the hold ends in done")
    func holdCommits() async throws {
        let fixture = try makeFixture()
        let todo = insert("Yes", in: fixture.today, fixture)
        fixture.actions.holdDuration = .milliseconds(20)

        // Await the hold itself — its wait, the Reduce Motion fade and the
        // commit. A wall-clock deadline here failed on CI: Swift Testing runs
        // every @MainActor test in parallel on the one main actor, so other
        // tests' bodies can hold it for seconds and the deadline lapsed
        // before the commit got its turn.
        let hold = fixture.actions.toggleDone(todo)
        #expect(hold != nil)
        await hold?.value

        #expect(todo.isCompleted)
        #expect(fixture.actions.holding.isEmpty)
    }
}

@MainActor
@Suite("ToastCenter")
struct ToastCenterTests {
    @Test("a toast without an action shows no button")
    func noAction() {
        let toasts = ToastCenter()
        toasts.show("Couldn’t sync", action: nil)
        #expect(toasts.current?.actionLabel == nil)
    }

    @Test("toasts time out and run their expiry")
    func timesOut() async throws {
        let toasts = ToastCenter()
        toasts.duration = .milliseconds(20)
        var expired = false
        toasts.show("Deleted", onExpire: { expired = true }, action: {})
        // Await the countdown itself, not a wall-clock deadline: on a crowded
        // main actor the deadline can lapse before the expiry runs.
        await toasts.timer?.value
        #expect(toasts.current == nil)
        #expect(expired)
    }
}

@Suite("Pages")
struct PageTests {
    @MainActor
    @Test("a time list pages; a collection opens over Lists")
    func showList() {
        let vm = TodoViewModel()
        let lists = [
            TodoListModel(id: "today", userId: "u", name: "Today", kind: "system", systemKind: .today),
            TodoListModel(id: "thisweek", userId: "u", name: "This Week", kind: "system", systemKind: .thisWeek),
            TodoListModel(id: "groceries", userId: "u", name: "Groceries")
        ]
        vm.show(listId: "thisweek", in: lists)
        #expect(vm.page == .thisWeek)
        #expect(vm.currentListId(in: lists) == "thisweek")

        vm.show(listId: "groceries", in: lists)
        #expect(vm.page == .lists)
        #expect(vm.openCollectionId == "groceries")
        #expect(vm.currentListId(in: lists) == "groceries")

        vm.openCollectionId = nil
        #expect(vm.currentListId(in: lists) == nil)
    }

    @MainActor
    @Test("page rows: pinned first, then position; done and deleted left out")
    func pageOrder() {
        let vm = TodoViewModel()
        func todo(_ title: String, _ position: String, pinned: Bool = false) -> TodoItem {
            let item = TodoItem(title: title, position: position)
            item.listKey = "today"
            item.pinned = pinned
            return item
        }
        let a = todo("A", "a1")
        let b = todo("B", "a2", pinned: true)
        let c = todo("C", "a0")
        let done = todo("Done", "a3")
        done.isCompleted = true
        let other = todo("Other", "a0")
        other.listKey = "someday"
        #expect(vm.pageTodos(from: [a, b, c, done, other], listId: "TODAY").map(\.title) == ["B", "C", "A"])
    }
}

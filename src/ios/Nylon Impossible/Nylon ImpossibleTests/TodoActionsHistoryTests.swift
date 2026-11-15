//
//  TodoActionsHistoryTests.swift
//  Nylon ImpossibleTests
//
//  TodoActions on the window's undo manager: each action with an Undo toast
//  goes into the history, ⌘Z and ⇧⌘Z step through it with "Undone: …" and
//  "Redone: …", and a sent delete leaves it.
//

import Foundation
import SwiftData
import Testing
@testable import Nylon_Impossible

@MainActor
@Suite("TodoActions undo history")
struct TodoActionsHistoryTests {
    private struct Fixture {
        let container: ModelContainer
        let context: ModelContext
        let actions: TodoActions
        let today: TodoListModel
        let week: TodoListModel
    }

    private func makeFixture() throws -> Fixture {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: TodoItem.self, TodoUrl.self, TodoListModel.self, configurations: config)
        let context = container.mainContext
        let today = TodoListModel(id: "today", userId: "u1", name: "Today", kind: "system", systemKind: .today)
        let week = TodoListModel(id: "thisweek", userId: "u1", name: "This week", kind: "system", systemKind: .thisWeek)
        [today, week].forEach(context.insert)
        let actions = TodoActions()
        actions.reduceMotion = true
        actions.toasts.duration = .seconds(60)
        actions.configure(context: context) {}
        return Fixture(container: container, context: context, actions: actions, today: today, week: week)
    }

    private func insert(_ title: String, in list: TodoListModel, _ fixture: Fixture, position: String = "a0") -> TodoItem {
        let todo = TodoItem(title: title, userId: "u1", position: position)
        todo.listKey = list.id
        fixture.context.insert(todo)
        return todo
    }

    /// The fixture's actions on an undo manager, as the window's are.
    private func attachManager(_ fixture: Fixture) -> UndoManager {
        let manager = UndoManager()
        manager.groupsByEvent = false
        fixture.actions.history.attach(manager)
        return manager
    }

    @Test("⌘Z steps back through two Dones and a move, newest first, and ⇧⌘Z redoes them")
    func undoHistorySteps() throws {
        let fixture = try makeFixture()
        let manager = attachManager(fixture)
        let first = insert("Water the plants", in: fixture.today, fixture, position: "a1")
        let second = insert("Call Sam", in: fixture.today, fixture, position: "a2")
        let third = insert("Send invoice", in: fixture.today, fixture, position: "a3")
        fixture.actions.commitDone(first)
        fixture.actions.commitDone(second)
        fixture.actions.move(third, toList: fixture.week.id)

        #expect(manager.undoActionName == "Moved to this week")
        manager.undo()
        #expect(third.listKey == fixture.today.id)
        #expect(third.position == "a3")
        #expect(fixture.actions.toasts.current?.text == "Undone: Moved to this week")
        #expect(fixture.actions.toasts.current?.actionLabel == nil)
        #expect(manager.undoActionName == "Done")
        manager.undo()
        #expect(!second.isCompleted)
        manager.undo()
        #expect(!first.isCompleted)
        #expect(fixture.actions.toasts.current?.text == "Undone: Done")
        #expect(!manager.canUndo)

        #expect(manager.redoActionName == "Done")
        manager.redo()
        manager.redo()
        #expect(first.isCompleted)
        #expect(second.isCompleted)
        #expect(fixture.actions.toasts.current?.text == "Redone: Done")
        #expect(manager.redoActionName == "Moved to this week")
    }

    @Test("pins, edits, quiet moves and reorders don't clear redo; a history action does")
    func onlyHistoryClearsRedo() throws {
        let fixture = try makeFixture()
        let manager = attachManager(fixture)
        let todo = insert("Plan trip", in: fixture.today, fixture)
        let other = insert("Book flights", in: fixture.today, fixture, position: "a5")
        fixture.actions.commitDone(todo)
        manager.undo()

        fixture.actions.togglePin(other)
        fixture.actions.setDue(other, Date())
        other.title = "Book the flights"
        fixture.actions.edited()
        fixture.actions.move(other, toList: fixture.week.id, announce: false)
        #expect(manager.canRedo)
        manager.redo()
        #expect(todo.isCompleted)

        manager.undo()
        fixture.actions.move(other, toList: fixture.today.id)
        #expect(!manager.canRedo)
    }

    @Test("a toast's Undo button is an undo from the history, so ⇧⌘Z redoes it")
    func toastUndoRedoable() throws {
        let fixture = try makeFixture()
        let manager = attachManager(fixture)
        let todo = insert("Water the plants", in: fixture.today, fixture)
        fixture.actions.commitDone(todo)

        fixture.actions.toasts.performAction()
        #expect(!todo.isCompleted)
        // As on the web: the toast's own Undo is its feedback.
        #expect(fixture.actions.toasts.current == nil)
        #expect(manager.redoActionName == "Done")

        manager.redo()
        #expect(todo.isCompleted)
        #expect(fixture.actions.toasts.current?.text == "Redone: Done")
    }

    @Test("redoing a delete hides it again for a fresh stretch; once sent it leaves the history")
    func redoDelete() throws {
        let fixture = try makeFixture()
        let manager = attachManager(fixture)
        let kept = insert("Water the plants", in: fixture.today, fixture)
        let todo = insert("Renew passport", in: fixture.week, fixture)
        fixture.actions.commitDone(kept)
        fixture.actions.delete(todo)

        manager.undo()
        #expect(!fixture.actions.pendingDeletes.contains(todo.id))
        #expect(fixture.actions.toasts.current?.text == "Undone: Deleted")
        manager.redo()
        #expect(fixture.actions.pendingDeletes.contains(todo.id))
        #expect(fixture.actions.deleteTimers[todo.id.uuidString] != nil)
        #expect(!todo.isSoftDeleted)

        fixture.actions.flush()
        #expect(todo.isSoftDeleted)
        #expect(fixture.actions.history.past.map(\.text) == ["Done"])
        #expect(manager.undoActionName == "Done")
    }

    @Test("a sent delete lets go of its entry, for a todo and a list")
    func sentDeleteFreesEntry() throws {
        let fixture = try makeFixture()
        let todo = insert("Renew passport", in: fixture.week, fixture)
        let studio = TodoListModel(id: "studio", userId: "u1", name: "Studio", kind: "custom", systemKind: nil)
        fixture.context.insert(studio)
        fixture.actions.delete(todo)
        weak var deleted = fixture.actions.history.past.last
        fixture.actions.flush()
        fixture.actions.deleteList(studio, todoCount: 0) { finished in finished() }
        weak var deletedList = fixture.actions.history.past.last
        fixture.actions.flush()

        #expect(fixture.actions.history.past.isEmpty)
        #expect(deleted == nil)
        #expect(deletedList == nil)
    }

    @Test("redoing a list delete hides it again; undoing it brings it back unsent")
    func redoDeleteList() throws {
        let fixture = try makeFixture()
        let manager = attachManager(fixture)
        let studio = TodoListModel(id: "studio", userId: "u1", name: "Studio", kind: "custom", systemKind: nil)
        fixture.context.insert(studio)
        var committed = 0
        fixture.actions.deleteList(studio, todoCount: 2) { _ in committed += 1 }
        #expect(manager.undoActionName == "Deleted “Studio” and 2 todos")

        manager.undo()
        #expect(fixture.actions.pendingListDeletes.isEmpty)
        manager.redo()
        #expect(fixture.actions.pendingListDeletes.contains("studio"))
        #expect(fixture.actions.toasts.current?.text == "Redone: Deleted “Studio” and 2 todos")
        fixture.actions.flush()
        #expect(committed == 1)
        #expect(!manager.canUndo)
    }

    @Test("an action whose todo has since been deleted says Already deleted and drops out")
    func undoGoneTodo() throws {
        let fixture = try makeFixture()
        let manager = attachManager(fixture)
        let todo = insert("Send invoice", in: fixture.today, fixture)
        fixture.actions.move(todo, toList: fixture.week.id)
        // Deleted on another device, then synced down.
        todo.isSoftDeleted = true

        manager.undo()
        #expect(todo.listKey == fixture.week.id)
        #expect(fixture.actions.toasts.current?.text == "Already deleted")
        #expect(!manager.canRedo)
        #expect(fixture.actions.history.past.isEmpty)
    }

    @Test("Back in, from the Done history, is undoable and redoable")
    func restoreHistory() throws {
        let fixture = try makeFixture()
        let manager = attachManager(fixture)
        let todo = insert("Stretch", in: fixture.today, fixture)
        todo.isCompleted = true
        fixture.actions.restoreFromDone(todo)
        #expect(manager.undoActionName == "Back in today")

        manager.undo()
        #expect(todo.isCompleted)
        manager.redo()
        #expect(!todo.isCompleted)
        #expect(fixture.actions.toasts.current?.text == "Redone: Back in today")
    }
}

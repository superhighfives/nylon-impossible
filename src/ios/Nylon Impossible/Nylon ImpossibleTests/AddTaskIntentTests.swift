//
//  AddTaskIntentTests.swift
//  Nylon ImpossibleTests
//
//  The Siri / Shortcuts "Add todo" intent: the list parameter's options and
//  matching, which list a todo lands in, and the confirmation it speaks.
//

import Foundation
import SwiftData
import Testing
@testable import Nylon_Impossible

@Suite("AddTaskIntent")
struct AddTaskIntentTests {
    private let lists = [
        TodoListModel(id: "T-1", userId: "u", name: "Today", kind: "system", systemKind: .today),
        TodoListModel(id: "W-2", userId: "u", name: "This Week", kind: "system", systemKind: .thisWeek),
        TodoListModel(id: "S-3", userId: "u", name: "Someday", kind: "system", systemKind: .someday),
        TodoListModel(id: "Z-9", userId: "u", name: "Studio", position: "a1"),
        TodoListModel(id: "G-4", userId: "u", name: "Groceries", position: "a0"),
        TodoListModel(id: "X-5", userId: "someone-else", name: "Not yours"),
    ]

    // MARK: - Options

    @Test("Offers Today, This Week, Someday, then your lists by position")
    func offersListsInOrder() {
        let names = TodoListEntity.all(from: lists, userId: "u").map(\.name)
        #expect(names == ["Today", "This Week", "Someday", "Groceries", "Studio"])
    }

    @Test("The time lists are identified by kind, your lists by id")
    func entityIds() {
        let ids = TodoListEntity.all(from: lists, userId: "u").map(\.id)
        #expect(ids == ["today", "this-week", "someday", "G-4", "Z-9"])
    }

    @Test("The time lists are offered before the first sync")
    func offersTimeListsWithNoStore() {
        #expect(TodoListEntity.all(from: [], userId: nil).map(\.name) == ["Today", "This Week", "Someday"])
    }

    @Test("Matching a spoken name ignores case, and puts an exact name first")
    func matchesSpokenName() {
        let all = TodoListEntity.all(from: lists, userId: "u")
        #expect(TodoListQuery.matching("this week", in: all).map(\.name) == ["This Week"])
        #expect(TodoListQuery.matching("GROCERIES", in: all).map(\.name) == ["Groceries"])
        #expect(TodoListQuery.matching("some", in: all).map(\.name) == ["Someday"])
        #expect(TodoListQuery.matching("nope", in: all).isEmpty)
    }

    // MARK: - Resolution

    @Test("No list means Today")
    func defaultsToToday() {
        let resolved = AddTaskIntent.resolve(TodoListEntity.today.target, lists: lists)
        #expect(resolved.listId == "T-1")
        #expect(resolved.name == "Today")
    }

    @Test("A time list resolves by kind to this account's row")
    func resolvesTimeList() {
        let resolved = AddTaskIntent.resolve(TodoListEntity.thisWeek.target, lists: lists)
        #expect(resolved.listId == "W-2")
        #expect(resolved.name == "This Week")
    }

    @Test("One of your lists resolves by id")
    func resolvesCustomList() {
        let resolved = AddTaskIntent.resolve(TodoListEntity(id: "G-4", name: "Groceries").target, lists: lists)
        #expect(resolved.listId == "G-4")
        #expect(resolved.name == "Groceries")
    }

    @Test("A deleted list falls back to Today, and says so")
    func deletedListFallsBack() {
        let resolved = AddTaskIntent.resolve(.list("gone"), lists: lists)
        #expect(resolved.listId == "T-1")
        #expect(resolved.name == "Today")
    }

    @Test("Before the first sync there's no list id, and the server files it in Today")
    func noStoreYet() {
        let resolved = AddTaskIntent.resolve(.someday, lists: [])
        #expect(resolved.listId == nil)
        #expect(resolved.name == "Today")
    }

    // MARK: - Confirmation

    @Test("Confirms the list, and the due day when one was said")
    func confirmation() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        // A Monday, so "friday" is four days out and reads as "Fri".
        let now = try #require(calendar.date(from: DateComponents(year: 2026, month: 10, day: 19, hour: 9)))
        let parsed = TodoDateParser.parse("Send the invoice friday", now: now)
        let due = try #require(parsed.dueDay)
        #expect(parsed.title == "Send the invoice")
        #expect(AddTaskIntent.confirmation(listName: "This Week", dueDate: due, now: now) == "Added to This Week · Due Fri")
        #expect(AddTaskIntent.confirmation(listName: "Today", dueDate: nil, now: now) == "Added to Today")
    }

    @Test("\"Pay rent tomorrow\" sets the due day through the composer's path")
    @MainActor
    func titleGoesThroughDateParser() throws {
        let container = try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoListModel.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        let destination = AddTaskIntent.resolve(TodoListEntity.thisWeek.target, lists: lists)
        let todo = try #require(TaskCreationService.createSmart(
            text: "Pay rent tomorrow",
            userId: "u",
            context: container.mainContext,
            allTodos: [],
            listId: destination.listId
        ))
        #expect(todo.title == "Pay rent")
        #expect(todo.listKey == "W-2")
        let due = try #require(todo.dueDate)
        #expect(AddTaskIntent.confirmation(listName: destination.name, dueDate: due) == "Added to This Week · Due Tomorrow")
    }
}

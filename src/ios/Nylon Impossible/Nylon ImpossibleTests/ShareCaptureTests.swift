//
//  ShareCaptureTests.swift
//  Nylon ImpossibleTests
//
//  The share extension's rules: a todo per line, typed dates, the shared
//  link riding on the first todo, and the placeholder an untouched link gets.
//

import Foundation
import SwiftData
import Testing
@testable import Nylon_Impossible

@Suite("ShareCapture")
struct ShareCaptureTests {
    private let url = "https://www.visitlisboa.com/tram-28"

    // MARK: - Line splitting

    @Test("Shared text makes one todo per non-empty line")
    func oneTodoPerLine() {
        let entries = ShareCapture.entries(text: "Milk\n\n  Eggs  \nBread\n", sharedURL: nil, fallbackTitle: nil)
        #expect(entries.map(\.title) == ["Milk", "Eggs", "Bread"])
        #expect(entries.allSatisfy { $0.url == nil && !$0.isPlaceholder })
    }

    @Test("Empty text with no link makes nothing")
    func emptyTextMakesNothing() {
        #expect(ShareCapture.entries(text: " \n ", sharedURL: nil, fallbackTitle: nil).isEmpty)
    }

    @Test("A line past the title limit spills into notes")
    func longLineSpillsIntoNotes() throws {
        let long = String(repeating: "word ", count: 150)
        let entry = try #require(ShareCapture.entries(text: long, sharedURL: nil, fallbackTitle: nil).first)
        #expect(entry.title.count <= TodoText.titleMax)
        #expect(entry.notes != nil)
    }

    // MARK: - Links

    @Test("An untouched link is one todo with the placeholder title")
    func untouchedLink() {
        let entries = ShareCapture.entries(
            text: "",
            sharedURL: url,
            fallbackTitle: ShareCapture.fallbackTitle(url: url, suppliedTitle: nil)
        )
        #expect(entries == [.init(title: "Check visitlisboa.com", notes: nil, url: url, isPlaceholder: true)])
    }

    @Test("The sharing app's page title is used when it supplies one")
    func suppliedTitle() {
        #expect(ShareCapture.fallbackTitle(url: url, suppliedTitle: "  Tram 28 guide ") == "Tram 28 guide")
        #expect(ShareCapture.fallbackTitle(url: url, suppliedTitle: "  ") == "Check visitlisboa.com")
    }

    @Test("The sheet shows a link as its domain until it's fetched")
    func displayDomain() {
        #expect(ShareCapture.displayDomain(for: url) == "visitlisboa.com")
        #expect(ShareCapture.displayDomain(for: "not a link") == nil)
    }

    @Test("Typed lines with a link: the link rides on the first todo")
    func linkOnFirstLine() {
        let entries = ShareCapture.entries(text: "Plan the tram day\nBook tickets", sharedURL: url, fallbackTitle: "x")
        #expect(entries.map(\.url) == [url, nil])
        #expect(entries.allSatisfy { !$0.isPlaceholder })
    }

    @Test("A link already pasted into the text isn't attached twice")
    func linkAlreadyInText() {
        let entries = ShareCapture.entries(text: "Read \(url)", sharedURL: url, fallbackTitle: "x")
        #expect(entries.first?.url == nil)
    }

    // MARK: - Saving

    @MainActor
    private func makeContext() throws -> ModelContext {
        let container = try ModelContainer(
            for: TodoItem.self, TodoUrl.self, TodoListModel.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        return ModelContext(container)
    }

    @Test("Saving lines keeps their order and parses each line's date")
    @MainActor
    func savesLinesInOrder() throws {
        let context = try makeContext()
        let created = try ShareCapture.save(
            ShareCapture.Input(text: "Pay rent tomorrow\nCall the bank", sharedURL: nil, fallbackTitle: nil),
            listId: "W-2", parseDates: true, userId: "u", context: context
        )
        #expect(created.map(\.title) == ["Pay rent", "Call the bank"])
        #expect(created.first?.dueDate != nil)
        #expect(created.last?.dueDate == nil)
        #expect(created.allSatisfy { $0.listKey == "W-2" })
        // Positions put the first line on top of the list.
        let positions = created.map(\.position)
        #expect(positions == positions.sorted())
    }

    @Test("× on the due chip keeps the words as typed")
    @MainActor
    func keepsWords() throws {
        let context = try makeContext()
        let created = try ShareCapture.save(
            ShareCapture.Input(text: "Pay rent tomorrow", sharedURL: nil, fallbackTitle: nil),
            listId: nil, parseDates: false, userId: "u", context: context
        )
        #expect(created.first?.title == "Pay rent tomorrow")
        #expect(created.first?.dueDate == nil)
    }

    @Test("An untouched link saves the placeholder and the link, undated")
    @MainActor
    func savesUntouchedLink() throws {
        let context = try makeContext()
        // A sharing app's title that happens to end in a date word stays a title.
        let created = try ShareCapture.save(
            ShareCapture.Input(text: "", sharedURL: url, fallbackTitle: "What to do in Lisbon on Friday"),
            listId: nil, parseDates: true, userId: "u", context: context
        )
        let todo = try #require(created.first)
        #expect(todo.title == "What to do in Lisbon on Friday")
        #expect(todo.dueDate == nil)
        #expect(todo.pendingUrls == [url])
    }
}

//
//  DeepLinkTests.swift
//  Nylon ImpossibleTests
//
//  `nylon://add?list=…` parsing, the URL the widget and control build, and
//  where each link takes the app.
//

import Foundation
import Testing
@testable import Nylon_Impossible

@Suite("DeepLink")
struct DeepLinkTests {
    private func link(_ string: String) -> DeepLink? {
        URL(string: string).flatMap(DeepLink.init(url:))
    }

    // MARK: - Parsing

    @Test("nylon://add with no list adds to Today")
    func addDefaultsToToday() {
        #expect(link("nylon://add") == .add(list: .today))
        #expect(link("nylon://add?list=") == .add(list: .today))
    }

    @Test("The time lists parse by name, in any of their spellings")
    func timeLists() {
        #expect(link("nylon://add?list=today") == .add(list: .today))
        #expect(link("nylon://add?list=this-week") == .add(list: .thisWeek))
        #expect(link("nylon://add?list=thisweek") == .add(list: .thisWeek))
        #expect(link("nylon://add?list=week") == .add(list: .thisWeek))
        #expect(link("nylon://add?list=Someday") == .add(list: .someday))
    }

    @Test("Any other list value is a list id, case kept")
    func listId() {
        #expect(link("nylon://add?list=AB12-cd") == .add(list: .list("AB12-cd")))
    }

    @Test("The scheme and action are case-insensitive, and the path form works")
    func lenientForms() {
        #expect(link("NYLON://ADD?list=today") == .add(list: .today))
        #expect(link("nylon:///add?list=someday") == .add(list: .someday))
        #expect(link("nylon://new") == .add(list: .today))
    }

    @Test("Other schemes and actions are not ours")
    func rejectsOthers() {
        #expect(link("https://nylonimpossible.com/add") == nil)
        #expect(link("clerk.nylonimpossible.com://callback") == nil)
        #expect(link("nylon://settings") == nil)
        #expect(link("nylon://") == nil)
    }

    @Test("A built URL parses back to the same link", arguments: [
        DeepLink.add(list: .today),
        .add(list: .thisWeek),
        .add(list: .someday),
        .add(list: .list("6F1C-list id")),
    ])
    func roundTrips(_ original: DeepLink) {
        #expect(DeepLink(url: original.url) == original)
    }

    @Test("The widget's URL is the documented one")
    func todayURL() {
        #expect(DeepLink.add(list: .today).url.absoluteString == "nylon://add?list=today")
    }

    // MARK: - Routing

    private let lists = [
        TodoListModel(id: "T-1", userId: "u", name: "Today", kind: "system", systemKind: .today),
        TodoListModel(id: "W-2", userId: "u", name: "This Week", kind: "system", systemKind: .thisWeek),
        TodoListModel(id: "S-3", userId: "u", name: "Someday", kind: "system", systemKind: .someday),
        TodoListModel(id: "G-4", userId: "u", name: "Groceries"),
    ]

    @Test("A time list routes to its page and its list")
    func routesTimeLists() {
        #expect(DeepLinkDestination.resolve(.today, lists: lists)
            == DeepLinkDestination(page: .today, collectionId: nil, listId: "T-1"))
        #expect(DeepLinkDestination.resolve(.thisWeek, lists: lists)
            == DeepLinkDestination(page: .thisWeek, collectionId: nil, listId: "W-2"))
        #expect(DeepLinkDestination.resolve(.someday, lists: lists)
            == DeepLinkDestination(page: .someday, collectionId: nil, listId: "S-3"))
    }

    @Test("One of your lists opens on the Lists page")
    func routesCollection() {
        #expect(DeepLinkDestination.resolve(.list("g-4"), lists: lists)
            == DeepLinkDestination(page: .lists, collectionId: "G-4", listId: "G-4"))
    }

    @Test("A system list's id routes like its name")
    func routesSystemListById() {
        #expect(DeepLinkDestination.resolve(.list("W-2"), lists: lists)
            == DeepLinkDestination(page: .thisWeek, collectionId: nil, listId: "W-2"))
    }

    @Test("An unknown list falls back to Today")
    func unknownListFallsBack() {
        #expect(DeepLinkDestination.resolve(.list("gone"), lists: lists)
            == DeepLinkDestination(page: .today, collectionId: nil, listId: "T-1"))
    }

    @Test("Before the first sync there's no list id, but the page is still Today")
    func noListsYet() {
        #expect(DeepLinkDestination.resolve(.today, lists: [])
            == DeepLinkDestination(page: .today, collectionId: nil, listId: nil))
    }
}

import Testing
import Foundation
import SwiftData
@testable import Nylon_Impossible

/// Runs the Swift parser against src/shared/src/todo-date-fixtures.json — the
/// same file the TS test (src/api/test/unit/todo-date.test.ts) loads. The JSON
/// is referenced into this test bundle as a resource ("Shared Fixtures" group
/// in the Xcode project), so there's one copy of the cases.
@Suite("TodoDateParser")
struct TodoDateParserTests {
    struct Fixture: Decodable, CustomTestStringConvertible {
        struct Expected: Decodable {
            let title: String
            let dueDay: String?
            let matched: String?
        }
        let name: String
        let text: String
        let now: String
        let timeZone: String
        let expected: Expected

        var testDescription: String { name }
    }

    private struct FixtureFile: Decodable {
        let cases: [Fixture]
    }

    private final class BundleToken {}

    static let fixtures: [Fixture] = {
        guard let url = Bundle(for: BundleToken.self)
            .url(forResource: "todo-date-fixtures", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(FixtureFile.self, from: data) else {
            return []
        }
        return file.cases
    }()

    private static func dayKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    @Test("Loads the shared fixtures")
    func loadsFixtures() {
        #expect(Self.fixtures.count >= 40)
    }

    @Test("Matches the shared fixtures", arguments: fixtures)
    func matchesFixture(_ fixture: Fixture) throws {
        let now = try #require(ISO8601DateFormatter().date(from: fixture.now))
        let result = TodoDateParser.parse(fixture.text, now: now, timeZoneIdentifier: fixture.timeZone)
        #expect(result.title == fixture.expected.title)
        #expect(result.dueDay.map(Self.dayKey) == fixture.expected.dueDay)
        #expect(result.matched == fixture.expected.matched)
    }

    @Test("Due day is midnight UTC, the stored form")
    func dueDayIsUTCMidnight() throws {
        let now = try #require(ISO8601DateFormatter().date(from: "2026-10-14T12:00:00Z"))
        let result = TodoDateParser.parse("Pay rent tomorrow", now: now, timeZoneIdentifier: "UTC")
        let due = try #require(result.dueDay)
        #expect(due.timeIntervalSince1970.truncatingRemainder(dividingBy: 86_400) == 0)
    }
}

@Suite("Typed dates on creation")
@MainActor
struct TypedDateCreationTests {
    private func makeContainer() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(for: TodoItem.self, configurations: config)
    }

    @Test("Add bar text is stripped and gets a due date")
    func createSmartParses() throws {
        let container = try makeContainer()
        let context = container.mainContext
        let todo = try #require(TaskCreationService.createSmart(
            text: "Pay rent tomorrow", userId: "u", context: context, allTodos: []
        ))
        #expect(todo.title == "Pay rent")
        #expect(todo.dueDate != nil)
    }

    @Test("A dismissed chip keeps the words")
    func createSmartWithoutParsing() throws {
        let container = try makeContainer()
        let context = container.mainContext
        let todo = try #require(TaskCreationService.createSmart(
            text: "Pay rent tomorrow", userId: "u", context: context, allTodos: [], parseDate: false
        ))
        #expect(todo.title == "Pay rent tomorrow")
        #expect(todo.dueDate == nil)
    }

    @Test("A weekday mid-sentence stays in the title")
    func createSmartLeavesMidSentence() throws {
        let container = try makeContainer()
        let context = container.mainContext
        let todo = try #require(TaskCreationService.createSmart(
            text: "Call Mum about Sunday lunch", userId: "u", context: context, allTodos: []
        ))
        #expect(todo.title == "Call Mum about Sunday lunch")
        #expect(todo.dueDate == nil)
    }
}

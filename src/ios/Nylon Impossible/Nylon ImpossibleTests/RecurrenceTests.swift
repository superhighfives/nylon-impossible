import Testing
import Foundation
@testable import Nylon_Impossible

@Suite("Recurrence")
struct RecurrenceTests {
    /// Parity fixtures — must stay in lockstep with
    /// src/shared/src/recurrence-test-fixtures.ts. If you add a case here,
    /// add the same row to the TS fixtures.
    struct Fixture {
        let name: String
        let frequency: RecurrenceFrequency
        let from: String
        let now: String
        let expected: String
    }

    static let fixtures: [Fixture] = [
        Fixture(name: "daily — single advance when due tomorrow",
                frequency: .daily,
                from: "2026-03-21T09:00:00Z",
                now: "2026-03-21T12:00:00Z",
                expected: "2026-03-22T09:00:00Z"),
        Fixture(name: "daily — skips a week of missed occurrences in one step",
                frequency: .daily,
                from: "2026-03-21T09:00:00Z",
                now: "2026-03-28T10:00:00Z",
                expected: "2026-03-29T09:00:00Z"),
        Fixture(name: "weekly — advances by seven days",
                frequency: .weekly,
                from: "2026-03-18T09:00:00Z",
                now: "2026-03-18T20:00:00Z",
                expected: "2026-03-25T09:00:00Z"),
        Fixture(name: "monthly — clamps Jan 31 to Feb 28 in a non-leap year",
                frequency: .monthly,
                from: "2027-01-31T09:00:00Z",
                now: "2027-01-31T10:00:00Z",
                expected: "2027-02-28T09:00:00Z"),
        Fixture(name: "monthly — clamps Jan 31 to Feb 29 in a leap year",
                frequency: .monthly,
                from: "2028-01-31T09:00:00Z",
                now: "2028-01-31T10:00:00Z",
                expected: "2028-02-29T09:00:00Z"),
        Fixture(name: "monthly — does not over-clamp on a 30-day month",
                frequency: .monthly,
                from: "2026-03-31T09:00:00Z",
                now: "2026-03-31T10:00:00Z",
                expected: "2026-04-30T09:00:00Z"),
        Fixture(name: "yearly — Feb 29 falls back to Feb 28 in a non-leap year",
                frequency: .yearly,
                from: "2028-02-29T09:00:00Z",
                now: "2028-02-29T10:00:00Z",
                expected: "2029-02-28T09:00:00Z"),
        Fixture(name: "next > now is strict — completing exactly at due time still advances once",
                frequency: .daily,
                from: "2026-03-21T09:00:00Z",
                now: "2026-03-21T09:00:00Z",
                expected: "2026-03-22T09:00:00Z"),
    ]

    @Test("parity fixtures match TS implementation", arguments: fixtures)
    func parityFixtures(fixture: Fixture) throws {
        let formatter = ISO8601DateFormatter()
        let from = try #require(formatter.date(from: fixture.from))
        let now = try #require(formatter.date(from: fixture.now))
        let expected = try #require(formatter.date(from: fixture.expected))

        let result = RecurrenceHelper.nextDueDate(
            Recurrence(frequency: fixture.frequency),
            from: from,
            now: now
        )

        #expect(result == expected, "\(fixture.name)")
    }
}

extension RecurrenceTests.Fixture: CustomStringConvertible {
    var description: String { name }
}

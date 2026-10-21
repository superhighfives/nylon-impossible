import Foundation
import Testing
@testable import Nylon_Impossible

@Suite("Overnight note: lastSweep decode")
struct LastSweepDecodeTests {
    private func decode(_ lastSweep: String?) throws -> APIUser {
        let field = lastSweep.map { #","lastSweep":\#($0)"# } ?? ""
        let json = """
        {"id":"u","email":"a@b.c","theme":"dark","timezone":"Europe/Lisbon",
         "createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"\(field)}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIUser.self, from: Data(json.utf8))
    }

    @Test("Reads the sweep, keeping `at` exactly as sent")
    func readsSweep() throws {
        let user = try decode(#"{"at":"2026-10-20T07:00:03.120Z","movedToThisWeek":2,"movedToSomeday":1}"#)
        let sweep = try #require(user.lastSweep)
        #expect(sweep.atString == "2026-10-20T07:00:03.120Z")
        #expect(sweep.movedToThisWeek == 2)
        #expect(sweep.movedToSomeday == 1)
        #expect(abs(sweep.at.timeIntervalSince1970 - 1_792_479_603.12) < 0.01)
    }

    @Test("Reads `at` without fractional seconds")
    func readsWholeSeconds() throws {
        let user = try decode(#"{"at":"2026-10-20T07:00:03Z","movedToThisWeek":0,"movedToSomeday":3}"#)
        #expect(user.lastSweep?.movedToSomeday == 3)
    }

    @Test("An older server that leaves it out still decodes")
    func absent() throws {
        let user = try decode(nil)
        #expect(user.lastSweep == nil)
        #expect(user.theme == "dark")
        #expect(user.timezone == "Europe/Lisbon")
    }

    @Test("null means no sweep")
    func null() throws {
        #expect(try decode("null").lastSweep == nil)
    }

    @Test("A malformed sweep is dropped, not the whole user")
    func malformed() throws {
        let user = try decode(#"{"at":"last tuesday","movedToThisWeek":2,"movedToSomeday":0}"#)
        #expect(user.lastSweep == nil)
        #expect(user.theme == "dark")
    }

    @Test("Round-trips through encoding")
    func roundTrip() throws {
        let user = try decode(#"{"at":"2026-10-20T07:00:03.120Z","movedToThisWeek":2,"movedToSomeday":1}"#)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let again = try decoder.decode(APIUser.self, from: encoder.encode(user))
        #expect(again.lastSweep == user.lastSweep)
    }
}

@Suite("Overnight note: copy")
struct OvernightCopyTests {
    @Test("This Week only")
    func weekOnly() {
        #expect(OvernightNote.text(movedToThisWeek: 2, movedToSomeday: 0) == "2 moved to This Week overnight")
    }

    @Test("Both")
    func both() {
        #expect(OvernightNote.text(movedToThisWeek: 2, movedToSomeday: 1) == "2 moved to This Week, 1 to Someday overnight")
    }

    @Test("Someday only")
    func somedayOnly() {
        #expect(OvernightNote.text(movedToThisWeek: 0, movedToSomeday: 1) == "1 moved to Someday overnight")
    }

    @Test("Nothing moved, nothing to say")
    func nothing() {
        #expect(OvernightNote.text(movedToThisWeek: 0, movedToSomeday: 0) == nil)
    }
}

@Suite("Overnight note: is it today?")
struct OvernightDayTests {
    private func date(_ iso: String) -> Date {
        ISO8601DateFormatter().date(from: iso)!
    }

    private func zone(_ id: String) -> TimeZone { TimeZone(identifier: id)! }

    @Test("Midnight in Los Angeles is still that day there")
    func losAngeles() {
        // 07:00Z is 00:00 PDT on the 20th; 15:00Z is 08:00 PDT the same day.
        #expect(OvernightNote.isToday(date("2026-10-20T07:00:00Z"), now: date("2026-10-20T15:00:00Z"), timeZone: zone("America/Los_Angeles")))
    }

    @Test("The same instants are different days in Tokyo")
    func tokyo() {
        // 16:00 on the 20th and 00:00 on the 21st, JST.
        #expect(!OvernightNote.isToday(date("2026-10-20T07:00:00Z"), now: date("2026-10-20T15:00:00Z"), timeZone: zone("Asia/Tokyo")))
    }

    @Test("Different UTC days can be the same local day")
    func acrossUTCMidnight() {
        let at = date("2026-10-20T23:30:00Z")
        let now = date("2026-10-21T01:00:00Z")
        #expect(!OvernightNote.isToday(at, now: now, timeZone: zone("UTC")))
        #expect(OvernightNote.isToday(at, now: now, timeZone: zone("America/New_York")))
    }

    @Test("Yesterday's sweep doesn't show")
    func yesterday() {
        let sweep = LastSweep(at: date("2026-10-19T07:00:00Z"), movedToThisWeek: 2, movedToSomeday: 0)
        #expect(OvernightNote.visibleText(sweep, now: date("2026-10-20T15:00:00Z"), timeZone: zone("America/Los_Angeles"), dismissedAt: nil) == nil)
    }

    @Test("Today's sweep shows")
    func today() {
        let sweep = LastSweep(at: date("2026-10-20T07:00:00Z"), movedToThisWeek: 2, movedToSomeday: 1)
        #expect(OvernightNote.visibleText(sweep, now: date("2026-10-20T15:00:00Z"), timeZone: zone("America/Los_Angeles"), dismissedAt: nil)
            == "2 moved to This Week, 1 to Someday overnight")
    }

    @Test("A sweep that moved nothing doesn't show")
    func movedNothing() {
        let sweep = LastSweep(at: date("2026-10-20T07:00:00Z"), movedToThisWeek: 0, movedToSomeday: 0)
        #expect(OvernightNote.visibleText(sweep, now: date("2026-10-20T15:00:00Z"), timeZone: zone("UTC"), dismissedAt: nil) == nil)
    }

    @Test("An unknown zone name falls back to the device's")
    func unknownZone() {
        #expect(OvernightNote.timeZone(named: "Mars/Olympus_Mons") == .autoupdatingCurrent)
        #expect(OvernightNote.timeZone(named: "Asia/Tokyo").identifier == "Asia/Tokyo")
    }
}

@Suite("Overnight note: dismissal")
struct OvernightDismissalTests {
    private func store() -> OvernightDismissal {
        let suite = "overnight-tests-\(UUID().uuidString)"
        return OvernightDismissal(defaults: UserDefaults(suiteName: suite)!)
    }

    private let now = ISO8601DateFormatter().date(from: "2026-10-20T15:00:00Z")!
    private let utc = TimeZone(identifier: "UTC")!

    @Test("Dismissing hides that sweep")
    func hides() {
        let dismissal = store()
        let sweep = LastSweep(at: now.addingTimeInterval(-3600), atString: "2026-10-20T14:00:00.000Z", movedToThisWeek: 2, movedToSomeday: 0)
        #expect(OvernightNote.visibleText(sweep, now: now, timeZone: utc, dismissedAt: dismissal.dismissedAt) != nil)
        dismissal.dismiss(sweep)
        #expect(dismissal.dismissedAt == "2026-10-20T14:00:00.000Z")
        #expect(OvernightNote.visibleText(sweep, now: now, timeZone: utc, dismissedAt: dismissal.dismissedAt) == nil)
    }

    @Test("The next sweep shows again")
    func nextSweep() {
        let dismissal = store()
        let first = LastSweep(at: now.addingTimeInterval(-3600), atString: "2026-10-20T14:00:00.000Z", movedToThisWeek: 2, movedToSomeday: 0)
        dismissal.dismiss(first)
        let second = LastSweep(at: now.addingTimeInterval(-60), atString: "2026-10-20T14:59:00.000Z", movedToThisWeek: 0, movedToSomeday: 1)
        #expect(OvernightNote.visibleText(second, now: now, timeZone: utc, dismissedAt: dismissal.dismissedAt) == "1 moved to Someday overnight")
    }

    @Test("Clear forgets the dismissal")
    func clears() {
        let dismissal = store()
        dismissal.dismiss(LastSweep(at: now, movedToThisWeek: 1, movedToSomeday: 0))
        dismissal.clear()
        #expect(dismissal.dismissedAt == nil)
    }
}

@MainActor
@Suite("Overnight note: preferences")
struct OvernightPreferencesTests {
    private let sweep = LastSweep(at: Date(), atString: "2026-10-20T07:00:00.000Z", movedToThisWeek: 2, movedToSomeday: 1)

    private func user(_ sweep: LastSweep?) -> APIUser {
        APIUser(
            id: "u", email: "a@b.c", theme: "system", timezone: "UTC", timezoneAuto: false,
            lastSweep: sweep, createdAt: Date(), updatedAt: Date()
        )
    }

    @Test("Fetching reads the sweep")
    func fetch() async {
        let api = MockAPIService()
        api.getMeResponse = user(sweep)
        let preferences = UserPreferencesService(apiService: api)
        await preferences.fetchPreferences()
        #expect(preferences.lastSweep == sweep)
    }

    @Test("A PATCH response without the sweep doesn't clear it")
    func patchKeepsSweep() async {
        let api = MockAPIService()
        api.getMeResponse = user(sweep)
        let preferences = UserPreferencesService(apiService: api)
        await preferences.fetchPreferences()
        api.updateMeResponse = user(nil)
        await preferences.setTheme("dark")
        #expect(preferences.lastSweep == sweep)
    }

    @Test("Coming back to the foreground picks up a new sweep")
    func refresh() async {
        let api = MockAPIService()
        api.getMeResponse = user(nil)
        let preferences = UserPreferencesService(apiService: api)
        await preferences.fetchPreferences()
        #expect(preferences.lastSweep == nil)
        api.getMeResponse = user(sweep)
        await preferences.refreshLastSweep()
        #expect(preferences.lastSweep == sweep)
    }

    @Test("Refresh does nothing before the first load")
    func refreshBeforeLoad() async {
        let api = MockAPIService()
        api.getMeResponse = user(sweep)
        let preferences = UserPreferencesService(apiService: api)
        await preferences.refreshLastSweep()
        #expect(preferences.lastSweep == nil)
    }

    @Test("Signing out forgets it")
    func reset() async {
        let api = MockAPIService()
        api.getMeResponse = user(sweep)
        let preferences = UserPreferencesService(apiService: api)
        await preferences.fetchPreferences()
        preferences.resetLocalState()
        #expect(preferences.lastSweep == nil)
    }
}

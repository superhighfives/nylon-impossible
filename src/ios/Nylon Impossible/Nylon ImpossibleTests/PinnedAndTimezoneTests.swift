import Testing
import Foundation
@testable import Nylon_Impossible

/// Sticky → Pin: the API sends both keys during expand/contract. The app reads
/// `pinned` first and falls back to the legacy `sticky`, and sends `pinned`.
@Suite("Pinned wire contract")
struct PinnedWireTests {
    private func decode(_ extra: String) throws -> APITodo {
        let json = """
        {"id":"a","userId":"u","title":"T","completed":false,
         "createdAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-01T00:00:00Z"\(extra)}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APITodo.self, from: Data(json.utf8))
    }

    @Test("Reads pinned")
    func readsPinned() throws {
        #expect(try decode(#","pinned":true,"sticky":true"#).isPinned)
    }

    @Test("Falls back to the legacy sticky key")
    func readsLegacySticky() throws {
        #expect(try decode(#","sticky":true"#).isPinned)
    }

    @Test("pinned wins over sticky")
    func pinnedWins() throws {
        #expect(try decode(#","pinned":false,"sticky":true"#).isPinned == false)
    }

    @Test("Missing both means unpinned")
    func missingMeansUnpinned() throws {
        #expect(try decode("").isPinned == false)
    }

    @Test("Changes send pinned, not sticky")
    func encodesPinned() throws {
        let change = TodoChange(
            id: "a", parentId: nil, listId: nil, title: nil, notes: nil,
            completed: nil, position: nil, dueDate: nil, recurrence: nil,
            completedAt: nil, updatedAt: Date(timeIntervalSince1970: 0),
            deleted: nil, pinned: true, urls: nil
        )
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(change)) as? [String: Any]
        #expect(json?["pinned"] as? Bool == true)
        #expect(json?["sticky"] == nil)
    }
}

@Suite("Automatic timezone")
@MainActor
struct AutomaticTimezoneTests {
    private func makeService(timezone: String, auto: Bool) -> (UserPreferencesService, MockAPIService) {
        let api = MockAPIService()
        api.getMeResponse = APIUser(
            id: "u", email: "e@x.com", theme: "system",
            timezone: timezone, timezoneAuto: auto,
            createdAt: Date(), updatedAt: Date()
        )
        return (UserPreferencesService(apiService: api), api)
    }

    @Test("Rule: reports only a changed, valid zone while automatic")
    func rule() {
        #expect(UserPreferencesService.automaticTimezoneUpdate(stored: "UTC", isAutomatic: true, device: "Europe/London") == "Europe/London")
        #expect(UserPreferencesService.automaticTimezoneUpdate(stored: "Europe/London", isAutomatic: true, device: "Europe/London") == nil)
        #expect(UserPreferencesService.automaticTimezoneUpdate(stored: "UTC", isAutomatic: false, device: "Europe/London") == nil)
        #expect(UserPreferencesService.automaticTimezoneUpdate(stored: "UTC", isAutomatic: true, device: "Not/AZone") == nil)
    }

    @Test("Reports the device zone after loading when automatic")
    func reportsWhenAutomatic() async {
        let (service, api) = makeService(timezone: "UTC", auto: true)
        await service.fetchPreferences()
        await service.reportDeviceTimezone("Asia/Tokyo")
        #expect(api.lastUpdateMeRequest?.timezone == "Asia/Tokyo")
        #expect(api.lastUpdateMeRequest?.timezoneAuto == nil)
    }

    @Test("Leaves a manual zone alone")
    func leavesManualAlone() async {
        let (service, api) = makeService(timezone: "Asia/Tokyo", auto: false)
        await service.fetchPreferences()
        api.lastUpdateMeRequest = nil
        await service.reportDeviceTimezone("Europe/London")
        #expect(api.lastUpdateMeRequest == nil)
    }

    @Test("Doesn't report before preferences load")
    func waitsForLoad() async {
        let (service, api) = makeService(timezone: "UTC", auto: true)
        await service.reportDeviceTimezone("Europe/London")
        #expect(api.lastUpdateMeRequest == nil)
    }

    @Test("A manual pick turns automatic off")
    func manualPick() async {
        let (service, api) = makeService(timezone: "UTC", auto: true)
        await service.fetchPreferences()
        await service.setManualTimezone("Asia/Tokyo")
        #expect(api.lastUpdateMeRequest?.timezone == "Asia/Tokyo")
        #expect(api.lastUpdateMeRequest?.timezoneAuto == false)
    }
}

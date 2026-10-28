import Testing
import Foundation
@testable import Nylon_Impossible

@Suite("API Models")
struct APIServiceTests {
    /// The decoder `APIService` and the widget's server refresh use.
    private func makeDecoder() -> JSONDecoder {
        .api
    }

    private func makeEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    @Test("SyncRequest encodes with ISO 8601 dates")
    func syncRequestEncoding() throws {
        let encoder = makeEncoder()
        let date = Date(timeIntervalSince1970: 1700000000) // 2023-11-14
        let request = SyncRequest(
            lastSyncedAt: date,
            changes: []
        )

        let data = try encoder.encode(request)
        let json = String(data: data, encoding: .utf8)!

        #expect(json.contains("2023-11-14"))
        #expect(json.contains("changes"))
    }

    @Test("SyncResponse decodes ISO 8601 date strings")
    func syncResponseDecodesISO8601() throws {
        let decoder = makeDecoder()
        let json = """
        {
            "todos": [{
                "id": "abc-123",
                "userId": "user_1",
                "title": "Test",
                "completed": false,
                "position": "a0",
                "createdAt": "2025-01-01T00:00:00.000Z",
                "updatedAt": "2025-01-01T00:00:00.000Z"
            }],
            "syncedAt": "2025-01-01T00:00:00.000Z",
            "conflicts": []
        }
        """

        let response = try decoder.decode(SyncResponse.self, from: json.data(using: .utf8)!)
        #expect(response.todos.count == 1)
        #expect(response.todos[0].title == "Test")
        #expect(response.syncedAt == "2025-01-01T00:00:00.000Z")
    }

    @Test("SyncResponse decodes Unix timestamp (seconds) as Date")
    func syncResponseDecodesUnixSeconds() throws {
        let decoder = makeDecoder()
        let json = """
        {
            "todos": [{
                "id": "abc-123",
                "userId": "user_1",
                "title": "Test",
                "completed": false,
                "position": "a0",
                "createdAt": 1700000000,
                "updatedAt": 1700000000
            }],
            "syncedAt": "2025-01-01T00:00:00.000Z",
            "conflicts": []
        }
        """

        let response = try decoder.decode(SyncResponse.self, from: json.data(using: .utf8)!)
        let todo = response.todos[0]
        #expect(abs(todo.createdAt.timeIntervalSince1970 - 1700000000) < 1)
    }

    /// Every date shape the decoder accepts, to the millisecond: the server's
    /// `toISOString()`, ISO 8601 without fractions, and unix seconds and
    /// milliseconds.
    @Test("Decodes every date shape the API sends", arguments: [
        ("\"2023-11-14T22:13:20.123Z\"", 1_700_000_000.123),
        ("\"2023-11-14T22:13:20Z\"", 1_700_000_000),
        ("\"2023-11-14T23:13:20+01:00\"", 1_700_000_000),
        ("1700000000", 1_700_000_000),
        ("1700000000123", 1_700_000_000.123)
    ])
    func decodesDateShapes(json: String, expected: Double) throws {
        let date = try makeDecoder().decode([Date].self, from: Data("[\(json)]".utf8))[0]
        #expect(abs(date.timeIntervalSince1970 - expected) < 0.0005)
    }

    @Test("Rejects a date it can't read")
    func rejectsBadDate() {
        #expect(throws: DecodingError.self) {
            try makeDecoder().decode([Date].self, from: Data("[\"yesterday\"]".utf8))
        }
    }

    @Test("TodoChange correctly encodes nil fields")
    func todoChangeEncodesNilFields() throws {
        let encoder = makeEncoder()
        let change = TodoChange(
            id: "abc-123",
            parentId: nil,
            listId: nil,
            title: nil,
            notes: nil,
            completed: true,
            position: nil,
            dueDate: nil,
            recurrence: nil,
            completedAt: nil,
            updatedAt: Date(timeIntervalSince1970: 1700000000),
            deleted: nil,
            pinned: nil,
            urls: nil
        )

        let data = try encoder.encode(change)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        // nil fields should not be present (or be null)
        #expect(json["id"] as? String == "abc-123")
        #expect(json["completed"] as? Bool == true)
        // completedAt is always sent explicitly (null here) so the server can
        // distinguish "clear it" from "leave alone" — see TodoChange.encode.
        #expect(json.keys.contains("completedAt"))
        #expect(json["completedAt"] is NSNull)
    }

    @Test("APIError has correct descriptions with URL context")
    func apiErrorDescriptions() {
        let testURL = "https://api.example.com/test"

        let unauthorized = APIError.unauthorized(url: testURL)
        #expect(unauthorized.errorDescription?.contains("Not authorized") == true)
        #expect(unauthorized.errorDescription?.contains(testURL) == true)

        let invalidResponse = APIError.invalidResponse(url: testURL)
        #expect(invalidResponse.errorDescription?.contains("Invalid") == true)
        #expect(invalidResponse.errorDescription?.contains(testURL) == true)

        let serverError = APIError.serverError(500, "Internal error", url: testURL)
        #expect(serverError.errorDescription?.contains("500") == true)
        #expect(serverError.errorDescription?.contains("Internal error") == true)
        #expect(serverError.errorDescription?.contains(testURL) == true)

        let networkError = APIError.networkError(URLError(.notConnectedToInternet), url: testURL)
        #expect(networkError.errorDescription?.contains("Network error") == true)
        #expect(networkError.errorDescription?.contains(testURL) == true)

        let decodingError = APIError.decodingError(
            DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "test")),
            url: testURL,
            statusCode: 200,
            responseBody: "{\"unexpected\": true}"
        )
        #expect(decodingError.errorDescription?.contains("Failed to decode") == true)
        #expect(decodingError.errorDescription?.contains(testURL) == true)
        #expect(decodingError.errorDescription?.contains("status: 200") == true)
        #expect(decodingError.errorDescription?.contains("{\"unexpected\": true}") == true)
    }

    @Test("APIError.decodingError description includes status code and body preview")
    func decodingErrorBodyPreview() {
        // execute() truncates the raw data to 500 bytes before storing; simulate that here
        let fullBody = String(repeating: "x", count: 600)
        let truncatedBody = String(fullBody.prefix(500))

        let decodingErr = APIError.decodingError(
            DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "bad data")),
            url: "https://api.example.com/todos",
            statusCode: 422,
            responseBody: truncatedBody
        )

        let description = decodingErr.errorDescription ?? ""
        #expect(description.contains("422") == true)
        // The 500-char body preview should appear verbatim in the description
        #expect(description.contains(truncatedBody) == true)
        // The untruncated 600-char body should not appear
        #expect(description.contains(fullBody) == false)
    }
}

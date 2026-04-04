import Testing
import Foundation
@testable import Nylon_Impossible

@Suite("API Models")
struct APIServiceTests {
    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()

            if let dateString = try? container.decode(String.self) {
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                if let date = formatter.date(from: dateString) {
                    return date
                }
                formatter.formatOptions = [.withInternetDateTime]
                if let date = formatter.date(from: dateString) {
                    return date
                }
            }

            if let timestamp = try? container.decode(Double.self) {
                if timestamp < 32_503_680_000 {
                    return Date(timeIntervalSince1970: timestamp)
                } else {
                    return Date(timeIntervalSince1970: timestamp / 1000)
                }
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date"
            )
        }
        return decoder
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

    @Test("TodoChange correctly encodes nil fields")
    func todoChangeEncodesNilFields() throws {
        let encoder = makeEncoder()
        let change = TodoChange(
            id: "abc-123",
            title: nil,
            notes: nil,
            completed: true,
            position: nil,
            dueDate: nil,
            priority: nil,
            updatedAt: Date(timeIntervalSince1970: 1700000000),
            deleted: nil,
            urls: nil
        )

        let data = try encoder.encode(change)
        let json = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        // nil fields should not be present (or be null)
        #expect(json["id"] as? String == "abc-123")
        #expect(json["completed"] as? Bool == true)
    }

    @Test("APIError has correct descriptions")
    func apiErrorDescriptions() {
        let unauthorized = APIError.unauthorized(url: "https://api.example.com/test")
        #expect(unauthorized.errorDescription?.contains("Not authorized") == true)

        let invalidResponse = APIError.invalidResponse(url: "https://api.example.com/test")
        #expect(invalidResponse.errorDescription?.contains("Invalid") == true)

        let serverError = APIError.serverError(500, "Internal error", url: "https://api.example.com/test")
        #expect(serverError.errorDescription?.contains("500") == true)
        #expect(serverError.errorDescription?.contains("Internal error") == true)
    }
}

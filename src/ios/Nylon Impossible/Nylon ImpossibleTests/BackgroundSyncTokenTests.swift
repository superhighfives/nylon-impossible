import Testing
import Foundation
@testable import Nylon_Impossible

@Suite("BackgroundSyncService token expiry")
struct BackgroundSyncTokenTests {
    /// An unsigned JWT with `payload` as its claims. Only the payload is read,
    /// so the header and signature can be anything.
    private func jwt(_ payload: [String: Any]) throws -> String {
        let data = try JSONSerialization.data(withJSONObject: payload)
        let encoded = data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "eyJhbGciOiJSUzI1NiJ9.\(encoded).signature"
    }

    @Test("Reads exp, less the margin")
    func readsExp() throws {
        let token = try jwt(["sub": "user_1", "exp": 1_800_000_060, "iat": 1_800_000_000])
        let expiry = BackgroundSyncService.expiry(ofJWT: token)
        #expect(expiry == Date(timeIntervalSince1970: 1_800_000_050))
    }

    /// Clerk's 60-second token is what the old fixed 50 minutes hid: the
    /// expiry has to follow the token, not a guess.
    @Test("A short-lived token expires when it says, not 50 minutes later")
    func shortLivedToken() throws {
        let issued = Date(timeIntervalSince1970: 1_800_000_000)
        let token = try jwt(["exp": issued.timeIntervalSince1970 + 60])
        let expiry = try #require(BackgroundSyncService.expiry(ofJWT: token, margin: 0))
        #expect(expiry.timeIntervalSince(issued) == 60)
    }

    @Test("Payloads that need base64 padding still decode")
    func paddedPayload() throws {
        // Payload lengths that aren't a multiple of three need one or two "="
        // once the URL-safe encoding has stripped them.
        for sub in ["a", "ab", "abc"] {
            let token = try jwt(["sub": sub, "exp": 1_800_000_000])
            #expect(BackgroundSyncService.expiry(ofJWT: token, margin: 0) != nil)
        }
    }

    @Test("Nil for anything that isn't a JWT with an exp", arguments: [
        "",
        "not-a-jwt",
        "a.b",
        "a.!!!.c",
    ])
    func malformed(token: String) {
        #expect(BackgroundSyncService.expiry(ofJWT: token) == nil)
    }

    @Test("Nil when the claims have no exp")
    func missingExp() throws {
        let token = try jwt(["sub": "user_1"])
        #expect(BackgroundSyncService.expiry(ofJWT: token) == nil)
    }
}

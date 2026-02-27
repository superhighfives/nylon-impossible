import Foundation
@testable import Nylon_Impossible

@MainActor
final class MockAuthService: AuthProviding {
    var isSignedIn: Bool = true
    var userId: String? = "user_test_123"
    var tokenToReturn: String = "fake-jwt-token"
    var shouldThrow: Bool = false

    func getToken() async throws -> String {
        if shouldThrow {
            throw AuthError.tokenFailed
        }
        return tokenToReturn
    }
}

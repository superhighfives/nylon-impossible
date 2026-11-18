import Foundation
import Testing
@testable import Nylon_Impossible

@Suite("WebSocket transient network drops")
struct WebSocketServiceTests {
    @Test("a lost connection is transient (Sentry NSURLErrorDomain -1005)")
    func connectionLost() {
        let error = NSError(domain: NSURLErrorDomain, code: NSURLErrorNetworkConnectionLost)
        #expect(WebSocketService.isTransientNetworkDrop(error))
    }

    @Test("a POSIX connection abort is transient (Sentry NSPOSIXErrorDomain 53)")
    func connectionAborted() {
        let error = NSError(domain: NSPOSIXErrorDomain, code: Int(ECONNABORTED))
        #expect(WebSocketService.isTransientNetworkDrop(error))
    }

    @Test("a URL error wrapping a POSIX reset is transient")
    func wrappedReset() {
        let underlying = NSError(domain: NSPOSIXErrorDomain, code: Int(ECONNRESET))
        let error = NSError(
            domain: NSURLErrorDomain,
            code: NSURLErrorUnknown,
            userInfo: [NSUnderlyingErrorKey: underlying]
        )
        #expect(WebSocketService.isTransientNetworkDrop(error))
    }

    @Test("being offline or timing out is transient")
    func offlineAndTimeout() {
        #expect(WebSocketService.isTransientNetworkDrop(
            NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet)
        ))
        #expect(WebSocketService.isTransientNetworkDrop(
            NSError(domain: NSURLErrorDomain, code: NSURLErrorTimedOut)
        ))
    }

    @Test("a TLS handshake cut off by a dropped connection is transient (Sentry NSURLErrorDomain -1200)")
    func tlsClosedDuringHandshake() {
        let error = NSError(
            domain: NSURLErrorDomain,
            code: NSURLErrorSecureConnectionFailed,
            userInfo: ["_kCFStreamErrorCodeKey": -9816, "_kCFStreamErrorDomainKey": 3]
        )
        #expect(WebSocketService.isTransientNetworkDrop(error))
    }

    @Test("a TLS certificate failure still reaches Sentry")
    func tlsCertificateFailure() {
        #expect(!WebSocketService.isTransientNetworkDrop(
            NSError(
                domain: NSURLErrorDomain,
                code: NSURLErrorSecureConnectionFailed,
                userInfo: ["_kCFStreamErrorCodeKey": -9807, "_kCFStreamErrorDomainKey": 3]
            )
        ))
        #expect(!WebSocketService.isTransientNetworkDrop(
            NSError(domain: NSURLErrorDomain, code: NSURLErrorSecureConnectionFailed)
        ))
    }

    @Test("real failures still reach Sentry")
    func realFailures() {
        #expect(!WebSocketService.isTransientNetworkDrop(
            NSError(domain: NSURLErrorDomain, code: NSURLErrorBadServerResponse)
        ))
        #expect(!WebSocketService.isTransientNetworkDrop(
            NSError(domain: NSURLErrorDomain, code: NSURLErrorUserAuthenticationRequired)
        ))
        #expect(!WebSocketService.isTransientNetworkDrop(
            NSError(domain: "Nylon", code: 1)
        ))
    }
}

@Suite("WebSocket URL")
struct WebSocketURLTests {
    @Test("the socket URL carries the ticket and no session token")
    func ticketOnly() throws {
        let url = try #require(WebSocketService.socketURL(
            apiBaseURL: URL(string: "https://api.nylonimpossible.com")!,
            ticket: "abc-DEF_123"
        ))
        #expect(url.absoluteString == "wss://api.nylonimpossible.com/ws?ticket=abc-DEF_123")
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        #expect(items.map(\.name) == ["ticket"])
        #expect(!url.absoluteString.contains("token"))
    }

    @Test("a local http API gets a ws socket")
    func localScheme() {
        let url = WebSocketService.socketURL(
            apiBaseURL: URL(string: "http://localhost:8787")!,
            ticket: "t"
        )
        #expect(url?.absoluteString == "ws://localhost:8787/ws?ticket=t")
    }

    @Test("the ticket is percent-encoded")
    func encoded() {
        let url = WebSocketService.socketURL(
            apiBaseURL: URL(string: "https://api.nylonimpossible.com")!,
            ticket: "a+b/c=&d"
        )
        #expect(url?.absoluteString == "wss://api.nylonimpossible.com/ws?ticket=a%2Bb%2Fc%3D%26d")
    }
}

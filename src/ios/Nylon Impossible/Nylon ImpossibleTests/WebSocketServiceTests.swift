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

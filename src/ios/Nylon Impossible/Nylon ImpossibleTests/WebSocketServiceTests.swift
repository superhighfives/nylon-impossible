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

/// A socket whose handshake the test settles: `refuse` fails it the way
/// URLSession reports a 401 on upgrade (-1011, in `receive`); `open` answers
/// the ping. Until then, receives and pings wait.
nonisolated final class MockWebSocket: WebSocketConnecting, @unchecked Sendable {
    private var receiveHandlers: [@Sendable (Result<URLSessionWebSocketTask.Message, Error>) -> Void] = []
    private var pongHandlers: [@Sendable (Error?) -> Void] = []
    private(set) var sent: [URLSessionWebSocketTask.Message] = []
    private(set) var resumed = false

    func resume() { resumed = true }
    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {}
    func send(
        _ message: URLSessionWebSocketTask.Message,
        completionHandler: @escaping @Sendable (Error?) -> Void
    ) {
        sent.append(message)
        completionHandler(nil)
    }
    func receive(
        completionHandler: @escaping @Sendable (Result<URLSessionWebSocketTask.Message, Error>) -> Void
    ) {
        receiveHandlers.append(completionHandler)
    }
    func sendPing(pongReceiveHandler: @escaping @Sendable (Error?) -> Void) {
        pongHandlers.append(pongReceiveHandler)
    }

    func refuse() {
        let error = NSError(domain: NSURLErrorDomain, code: NSURLErrorBadServerResponse)
        pongHandlers.forEach { $0(error) }
        receiveHandlers.forEach { $0(.failure(error)) }
        pongHandlers = []
        receiveHandlers = []
    }

    func open() {
        pongHandlers.forEach { $0(nil) }
        pongHandlers = []
    }
}

@Suite("WebSocket reconnects")
@MainActor
struct WebSocketReconnectTests {
    /// Drives a `WebSocketService` with mock sockets, a sleep that returns
    /// at once (recording its delay), and a reporter that counts.
    final class Harness {
        var sockets: [MockWebSocket] = []
        var delays: [TimeInterval] = []
        var captures: [String] = []
        var breadcrumbs: [String] = []
        var service: WebSocketService!

        init() {
            service = WebSocketService(
                apiService: MockAPIService(),
                makeSocket: { [unowned self] _ in
                    let socket = MockWebSocket()
                    self.sockets.append(socket)
                    return socket
                },
                sleep: { [unowned self] delay in self.delays.append(delay) },
                reporter: WebSocketErrorReporter(
                    capture: { [unowned self] _, event in self.captures.append(event) },
                    breadcrumb: { [unowned self] in self.breadcrumbs.append($0) }
                )
            )
        }

        /// Lets the service's main-actor hops run until `count` sockets exist.
        func waitForSocket(_ count: Int) async throws {
            for _ in 0..<1000 where sockets.count < count {
                await Task.yield()
            }
            try #require(sockets.count == count)
        }

        /// Lets pending main-actor hops (a pong landing) run.
        func settle() async {
            for _ in 0..<50 { await Task.yield() }
        }
    }

    @Test("refused handshakes back off 1, 2, 4… up to 30 s, and never count as connected")
    func refusedHandshakesBackOff() async throws {
        let harness = Harness()
        let service = harness.service!
        service.connect()

        for attempt in 1...7 {
            try await harness.waitForSocket(attempt)
            let socket = harness.sockets[attempt - 1]
            #expect(socket.resumed)
            #expect(!service.isConnected)
            service.notifyChanged()
            #expect(socket.sent.isEmpty)
            socket.refuse()
        }
        try await harness.waitForSocket(8)
        service.disconnect()

        #expect(harness.delays == [1, 2, 4, 8, 16, 30, 30])
    }

    @Test("a run of refused handshakes sends Sentry one event and breadcrumbs for the rest")
    func oneCapturePerRun() async throws {
        let harness = Harness()
        harness.service.connect()

        for attempt in 1...5 {
            try await harness.waitForSocket(attempt)
            harness.sockets[attempt - 1].refuse()
        }
        try await harness.waitForSocket(6)
        harness.service.disconnect()

        #expect(harness.captures == ["receive"])
        #expect(harness.breadcrumbs.count == 4)
    }

    @Test("an accepted handshake connects, resets the delay and ends the run of failures")
    func openEndsTheRun() async throws {
        let harness = Harness()
        let service = harness.service!
        service.connect()

        for attempt in 1...3 {
            try await harness.waitForSocket(attempt)
            harness.sockets[attempt - 1].refuse()
        }
        try await harness.waitForSocket(4)
        #expect(service.reconnectDelay == 8)

        let accepted = harness.sockets[3]
        accepted.open()
        await harness.settle()
        #expect(service.isConnected)
        #expect(service.reconnectDelay == 1)
        service.notifyChanged()
        #expect(accepted.sent.count == 1)

        // The connection drops and the next handshake is refused: a new run,
        // so Sentry hears about it again, after 1 s.
        accepted.refuse()
        try await harness.waitForSocket(5)
        #expect(!service.isConnected)
        harness.sockets[4].refuse()
        try await harness.waitForSocket(6)
        service.disconnect()

        #expect(harness.captures == ["receive", "receive"])
        #expect(harness.delays == [1, 2, 4, 1, 2])
    }
}

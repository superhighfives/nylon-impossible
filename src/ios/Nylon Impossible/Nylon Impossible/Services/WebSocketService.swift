//
//  WebSocketService.swift
//  Nylon Impossible
//

import Foundation
import Sentry

/// The parts of `URLSessionWebSocketTask` the service uses, so tests can
/// stand in a socket whose handshake fails.
nonisolated protocol WebSocketConnecting: AnyObject, Sendable {
    func resume()
    func cancel(with closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?)
    func send(
        _ message: URLSessionWebSocketTask.Message,
        completionHandler: @escaping @Sendable (Error?) -> Void
    )
    func receive(
        completionHandler: @escaping @Sendable (Result<URLSessionWebSocketTask.Message, Error>) -> Void
    )
    func sendPing(pongReceiveHandler: @escaping @Sendable (Error?) -> Void)
}

extension URLSessionWebSocketTask: WebSocketConnecting {}

/// Where socket failures go: Sentry events, or breadcrumbs for the rest.
struct WebSocketErrorReporter {
    var capture: (Error, _ event: String) -> Void
    var breadcrumb: (String) -> Void

    static let sentry = WebSocketErrorReporter(
        capture: { error, event in
            SentrySDK.capture(error: error) { scope in
                scope.setTag(value: "websocket", key: "area")
                scope.setTag(value: event, key: "event")
            }
        },
        breadcrumb: { message in
            let crumb = Breadcrumb(level: .info, category: "websocket")
            crumb.message = message
            SentrySDK.addBreadcrumb(crumb)
        }
    )
}

@Observable
@MainActor
final class WebSocketService {
    private let apiService: any APIProviding
    private let makeSocket: (URL) -> any WebSocketConnecting
    private let sleep: (TimeInterval) async throws -> Void
    private let reporter: WebSocketErrorReporter
    private var task: (any WebSocketConnecting)?
    private var reconnectTask: Task<Void, Never>?
    private(set) var reconnectDelay: TimeInterval = 1.0
    /// Whether this run of failures (since the socket last opened) has
    /// already sent Sentry an event. The rest of the run leaves breadcrumbs.
    private var failureRunReported = false

    /// True once the server has accepted the handshake (a pong or a message
    /// has come back), not merely once the socket has been started.
    private(set) var isConnected: Bool = false

    var onSyncNeeded: (() -> Void)?

    private static let maxReconnectDelay: TimeInterval = 30.0
    private static let initialReconnectDelay: TimeInterval = 1.0

    init(
        apiService: any APIProviding,
        makeSocket: @escaping (URL) -> any WebSocketConnecting = { url in
            URLSession(configuration: .default).webSocketTask(with: url)
        },
        sleep: @escaping (TimeInterval) async throws -> Void = { delay in
            try await Task.sleep(for: .seconds(delay))
        },
        // Optional because a default argument can't reach the main-actor
        // `.sentry`.
        reporter: WebSocketErrorReporter? = nil
    ) {
        self.apiService = apiService
        self.makeSocket = makeSocket
        self.sleep = sleep
        self.reporter = reporter ?? .sentry
    }

    func connect() {
        guard task == nil else { return }
        // Connecting now supersedes a reconnect that's waiting out its delay,
        // which would otherwise open a second socket when it fires.
        reconnectTask?.cancel()
        reconnectTask = nil

        Task {
            await doConnect()
        }
    }

    func disconnect() {
        reconnectTask?.cancel()
        reconnectTask = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        isConnected = false
    }

    func notifyChanged() {
        guard let task, isConnected else { return }
        let message = URLSessionWebSocketTask.Message.string("{\"type\":\"changed\"}")
        task.send(message) { error in
            if let error {
                print("[WebSocket] Send error: \(error)")
            }
        }
    }

    // MARK: - Private

    private func doConnect() async {
        do {
            let ticket = try await apiService.createWsTicket()
            guard let url = Self.socketURL(apiBaseURL: Config.apiBaseURL, ticket: ticket) else { return }

            let wsTask = makeSocket(url)
            self.task = wsTask
            wsTask.resume()

            // `resume()` only starts the handshake; a refused one (a 401, a
            // 5xx) fails later, in `receive`. The server sends nothing on
            // connect, so a pong is the first proof that it accepted.
            wsTask.sendPing { [weak self] error in
                guard error == nil else { return }
                Task { @MainActor [weak self] in
                    guard let self, self.task === wsTask else { return }
                    self.didOpen()
                }
            }

            receiveLoop()
        } catch {
            report(error, event: "connect")
            print("[WebSocket] Connect error: \(error)")
            scheduleReconnect()
        }
    }

    /// `…/ws?ticket=…` on the API's host, with `ws` or `wss` to match its
    /// scheme. Only the one-use ticket goes in the URL, never the session token.
    nonisolated static func socketURL(apiBaseURL: URL, ticket: String) -> URL? {
        let baseString = apiBaseURL.absoluteString
        let wsScheme = baseString.hasPrefix("https") ? "wss" : "ws"
        let wsBase = baseString.replacingOccurrences(of: "https://", with: "\(wsScheme)://")
            .replacingOccurrences(of: "http://", with: "\(wsScheme)://")
        let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        guard let encoded = ticket.addingPercentEncoding(withAllowedCharacters: unreserved) else { return nil }
        return URL(string: "\(wsBase)/ws?ticket=\(encoded)")
    }

    private func receiveLoop() {
        guard let currentTask = task else { return }
        currentTask.receive { [weak self] result in
            Task { @MainActor [weak self] in
                guard let self else { return }
                // Ignore callbacks from a task we've already replaced (e.g. a
                // reconnect started a new task before this stale result arrived),
                // so we never clobber the live connection's state.
                guard self.task === currentTask else { return }

                switch result {
                case .success(let message):
                    self.didOpen()
                    self.handleMessage(message)
                    self.receiveLoop()
                case .failure(let error):
                    // A cancelled receive is the expected result of us tearing
                    // down the task (e.g. on backgrounding) or the OS suspending
                    // the connection. It isn't a failure worth reporting, and the
                    // scene-phase handler reconnects on foreground, so don't
                    // schedule a redundant reconnect here. We still clear the
                    // connection state, otherwise an OS/network cancellation that
                    // didn't go through disconnect() would leave `task` non-nil
                    // and block a future connect() (guard task == nil).
                    if Self.isCancellation(error) {
                        print("[WebSocket] Receive cancelled: \(error)")
                        self.task = nil
                        self.isConnected = false
                        return
                    }
                    self.report(error, event: "receive")
                    print("[WebSocket] Receive error: \(error)")
                    self.handleDisconnect()
                }
            }
        }
    }

    /// The server accepted the handshake: the socket can send, and the next
    /// failure starts a new run with a 1 s delay and one Sentry event.
    private func didOpen() {
        guard !isConnected else { return }
        isConnected = true
        reconnectDelay = Self.initialReconnectDelay
        failureRunReported = false

        // Trigger a sync on connect to catch missed changes
        onSyncNeeded?()
    }

    private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
        switch message {
        case .string(let text):
            guard let data = text.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: String],
                  json["type"] == "sync" else { return }
            onSyncNeeded?()
        case .data:
            break
        @unknown default:
            break
        }
    }

    private static func isCancellation(_ error: Error) -> Bool {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return true
        }
        // POSIX ECANCELED (89) — surfaced when an in-flight receive is torn down.
        if nsError.domain == NSPOSIXErrorDomain && nsError.code == ECANCELED {
            return true
        }
        return nsError.domain == NSURLErrorDomain
            && nsError.underlyingErrors.contains { underlying in
                let underlyingNSError = underlying as NSError
                return underlyingNSError.domain == NSPOSIXErrorDomain
                    && underlyingNSError.code == ECANCELED
            }
    }

    /// Network conditions the socket meets in normal use: the connection
    /// dropping (-1005), no network or a timeout, and the POSIX aborts and
    /// resets the OS reports after sleep or a network switch. The service
    /// reconnects on its own, so these are breadcrumbs, not Sentry errors.
    /// A TLS failure (-1200) counts only when the connection closed
    /// mid-handshake; a certificate or protocol failure is still reported.
    nonisolated static func isTransientNetworkDrop(_ error: Error) -> Bool {
        let transientURLCodes: Set<Int> = [
            NSURLErrorNetworkConnectionLost,
            NSURLErrorNotConnectedToInternet,
            NSURLErrorTimedOut,
            NSURLErrorCannotConnectToHost,
            NSURLErrorCannotFindHost,
            NSURLErrorDNSLookupFailed,
            NSURLErrorDataNotAllowed
        ]
        let transientPOSIXCodes: Set<Int32> = [
            ECONNABORTED, ECONNRESET, ENOTCONN, ETIMEDOUT, ENETDOWN, ENETUNREACH, ENETRESET, EPIPE
        ]
        // errSSLClosedNoNotify and errSSLClosedAbort: the connection closed
        // during the TLS handshake (Sentry NSURLErrorDomain -1200 / -9816).
        let transientTLSStreamCodes: Set<Int> = [-9816, -9806]
        func isClosedDuringHandshake(_ nsError: NSError) -> Bool {
            guard nsError.domain == NSURLErrorDomain, nsError.code == NSURLErrorSecureConnectionFailed,
                  let streamCode = nsError.userInfo["_kCFStreamErrorCodeKey"] as? Int else { return false }
            return transientTLSStreamCodes.contains(streamCode)
        }
        func matches(_ nsError: NSError) -> Bool {
            (nsError.domain == NSURLErrorDomain && transientURLCodes.contains(nsError.code))
                || isClosedDuringHandshake(nsError)
                || (nsError.domain == NSPOSIXErrorDomain && Int32(exactly: nsError.code).map(transientPOSIXCodes.contains) == true)
        }
        let nsError = error as NSError
        return matches(nsError) || nsError.underlyingErrors.contains { matches($0 as NSError) }
    }

    /// Send a real failure to Sentry, once per run of failures; leave a
    /// breadcrumb for the rest of the run, for a transient drop, or for a
    /// failed ticket request `APIService` has already dealt with.
    private func report(_ error: Error, event: String) {
        guard !Self.isTransientNetworkDrop(error), !Self.isHandledByAPIService(error),
              !failureRunReported else {
            reporter.breadcrumb("\(event): \((error as NSError).domain) \((error as NSError).code)")
            return
        }
        failureRunReported = true
        reporter.capture(error, event)
    }

    /// `APIService` reports a network, server or decoding failure itself (or
    /// drops it as transient), and a 401 signs out rather than being a fault.
    /// `.invalidResponse` is the one `APIError` it throws unreported.
    nonisolated private static func isHandledByAPIService(_ error: Error) -> Bool {
        guard let apiError = error as? APIError else { return false }
        if case .invalidResponse = apiError { return false }
        return true
    }

    private func handleDisconnect() {
        task = nil
        isConnected = false
        scheduleReconnect()
    }

    private func scheduleReconnect() {
        reconnectTask?.cancel()
        reconnectTask = Task { @MainActor in
            do {
                try await sleep(reconnectDelay)
            } catch {
                return
            }
            guard !Task.isCancelled else { return }

            reconnectDelay = min(reconnectDelay * 2, Self.maxReconnectDelay)
            await doConnect()
        }
    }
}

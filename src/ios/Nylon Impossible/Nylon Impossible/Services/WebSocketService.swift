//
//  WebSocketService.swift
//  Nylon Impossible
//

import Foundation
import Sentry

@Observable
@MainActor
final class WebSocketService {
    private let authService: AuthService
    private var task: URLSessionWebSocketTask?
    private var reconnectTask: Task<Void, Never>?
    private var reconnectDelay: TimeInterval = 1.0

    private(set) var isConnected: Bool = false

    var onSyncNeeded: (() -> Void)?

    private static let maxReconnectDelay: TimeInterval = 30.0
    private static let initialReconnectDelay: TimeInterval = 1.0

    init(authService: AuthService) {
        self.authService = authService
    }

    func connect() {
        guard task == nil else { return }

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
            let token = try await authService.getToken()

            let baseString = Config.apiBaseURL.absoluteString
            let wsScheme = baseString.hasPrefix("https") ? "wss" : "ws"
            let wsBase = baseString.replacingOccurrences(of: "https://", with: "\(wsScheme)://")
                .replacingOccurrences(of: "http://", with: "\(wsScheme)://")
            let urlString = "\(wsBase)/ws?token=\(token)"

            guard let url = URL(string: urlString) else { return }

            let session = URLSession(configuration: .default)
            let wsTask = session.webSocketTask(with: url)
            self.task = wsTask
            wsTask.resume()

            isConnected = true
            reconnectDelay = Self.initialReconnectDelay

            // Trigger a sync on connect to catch missed changes
            onSyncNeeded?()

            receiveLoop()
        } catch {
            Self.report(error, event: "connect")
            print("[WebSocket] Connect error: \(error)")
            scheduleReconnect()
        }
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
                    Self.report(error, event: "receive")
                    print("[WebSocket] Receive error: \(error)")
                    self.handleDisconnect()
                }
            }
        }
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
        func matches(_ nsError: NSError) -> Bool {
            (nsError.domain == NSURLErrorDomain && transientURLCodes.contains(nsError.code))
                || (nsError.domain == NSPOSIXErrorDomain && transientPOSIXCodes.contains(Int32(nsError.code)))
        }
        let nsError = error as NSError
        return matches(nsError) || nsError.underlyingErrors.contains { matches($0 as NSError) }
    }

    /// Send a real failure to Sentry; leave a breadcrumb for a transient drop.
    nonisolated private static func report(_ error: Error, event: String) {
        guard !isTransientNetworkDrop(error) else {
            let crumb = Breadcrumb(level: .info, category: "websocket")
            crumb.message = "\(event): \((error as NSError).domain) \((error as NSError).code)"
            SentrySDK.addBreadcrumb(crumb)
            return
        }
        SentrySDK.capture(error: error) { scope in
            scope.setTag(value: "websocket", key: "area")
            scope.setTag(value: event, key: "event")
        }
    }

    private func handleDisconnect() {
        task = nil
        isConnected = false
        scheduleReconnect()
    }

    private func scheduleReconnect() {
        reconnectTask?.cancel()
        reconnectTask = Task { @MainActor in
            try? await Task.sleep(for: .seconds(reconnectDelay))
            guard !Task.isCancelled else { return }

            reconnectDelay = min(reconnectDelay * 2, Self.maxReconnectDelay)
            await doConnect()
        }
    }
}

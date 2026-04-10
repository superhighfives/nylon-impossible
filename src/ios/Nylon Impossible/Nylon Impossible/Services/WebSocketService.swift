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
            SentrySDK.capture(error: error) { scope in
                scope.setTag(value: "websocket", key: "area")
                scope.setTag(value: "connect", key: "event")
            }
            print("[WebSocket] Connect error: \(error)")
            scheduleReconnect()
        }
    }

    private func receiveLoop() {
        task?.receive { [weak self] result in
            Task { @MainActor [weak self] in
                guard let self else { return }

                switch result {
                case .success(let message):
                    self.handleMessage(message)
                    self.receiveLoop()
                case .failure(let error):
                    SentrySDK.capture(error: error) { scope in
                        scope.setTag(value: "websocket", key: "area")
                        scope.setTag(value: "receive", key: "event")
                    }
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

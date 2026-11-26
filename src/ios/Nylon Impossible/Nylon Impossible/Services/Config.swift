//
//  Config.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 2/20/26.
//

import Foundation

enum Config {
    // MARK: - Clerk
    // Get these from https://dashboard.clerk.com
    #if targetEnvironment(simulator)
    static let clerkPublishableKey = "pk_test_bW9yZS11bmljb3JuLTk0LmNsZXJrLmFjY291bnRzLmRldiQ"
    #else
    static let clerkPublishableKey = "pk_live_Y2xlcmsubnlsb25pbXBvc3NpYmxlLmNvbSQ"
    #endif

    // MARK: - Sentry
    // DSN read from Info.plist (set via SENTRY_DSN build setting). Empty or missing = Sentry disabled.
    static let sentryDSN: String? = {
        guard let dsn = Bundle.main.infoDictionary?["SentryDSN"] as? String,
              !dsn.isEmpty,
              !dsn.hasPrefix("$(") else { return nil }
        return dsn
    }()

    // Sentry environment tag.
    // - DEBUG builds → "development" (Xcode runs on simulator/device)
    // - TestFlight (Fastlane sets IS_TESTFLIGHT=YES via Info.plist) → "preview"
    // - App Store → "production"
    static let sentryEnvironment: String = {
        #if DEBUG
        return "development"
        #else
        if let flag = Bundle.main.infoDictionary?["IsTestFlight"] as? String,
           flag == "YES" {
            return "preview"
        }
        return "production"
        #endif
    }()

    // MARK: - API
    // Simulator uses localhost for local dev.
    // Device reads from Info.plist (set via API_BASE_URL build setting), defaulting to production.
    static let apiBaseURL: URL = {
        #if targetEnvironment(simulator)
        return URL(string: "http://localhost:8787")!
        #else
        if let override = Bundle.main.infoDictionary?["APIBaseURL"] as? String,
           !override.isEmpty,
           !override.hasPrefix("$("),   // unexpanded build setting
           let url = URL(string: override) {
            return url
        }
        return URL(string: "https://api.nylonimpossible.com")!
        #endif
    }()

    // MARK: - Web
    // The web app, where the Mac's menu bar hands a todo over (`/todo/:id`).
    // It sits beside the API: the API's host without its `api.` prefix, and
    // locally the web dev server on :3000 beside the API's :8787.
    static let webBaseURL: URL = webBase(forAPI: apiBaseURL)

    static func webBase(forAPI api: URL) -> URL {
        guard var components = URLComponents(url: api, resolvingAgainstBaseURL: false) else { return api }
        if let host = components.host, host.hasPrefix("api.") {
            components.host = String(host.dropFirst(4))
        } else if components.port == 8787 {
            components.port = 3000
        }
        components.path = ""
        return components.url ?? api
    }

    /// The web app's page for one todo.
    static func webURL(forTodo id: UUID, base: URL = webBaseURL) -> URL {
        base.appending(path: "todo/\(id.uuidString.lowercased())")
    }

    // MARK: - Support
    // GitHub's issue-template chooser (Report a problem or Suggest an idea).
    // Settings' About links here on the iPhone and the Mac alike.
    static let reportProblemURL = URL(string: "https://github.com/superhighfives/nylon-impossible/issues/new/choose")!
}

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
}

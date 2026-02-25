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
    // Simulator uses localhost, physical device uses production
    #if targetEnvironment(simulator)
    static let apiBaseURL = URL(string: "http://localhost:8787")!
    #else
    static let apiBaseURL = URL(string: "https://api.nylonimpossible.com")!
    #endif
}

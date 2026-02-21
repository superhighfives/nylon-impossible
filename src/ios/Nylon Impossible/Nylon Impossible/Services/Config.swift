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
    static let clerkPublishableKey = "pk_test_bW9yZS11bmljb3JuLTk0LmNsZXJrLmFjY291bnRzLmRldiQ"
    
    // MARK: - API
    // Automatically uses localhost in DEBUG builds (simulator/development)
    #if DEBUG
    static let apiBaseURL = URL(string: "http://localhost:8787")!
    #else
    static let apiBaseURL = URL(string: "https://api.nylonimpossible.com")!
    #endif
}

//
//  SharedModelContainer.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/4/26.
//

import Foundation
import SwiftData

enum SharedModelContainer {
    static let shared: ModelContainer = {
        let schema = Schema([TodoItem.self, TodoUrl.self])
        
        // Use App Group container for shared access
        let appGroupURL = FileManager.default.containerURL(
            forSecurityApplicationGroupIdentifier: "group.com.superhighfives.Nylon-Impossible"
        )!
        
        let storeURL = appGroupURL.appendingPathComponent("nylon.store")
        
        let config = ModelConfiguration(
            schema: schema,
            url: storeURL,
            cloudKitDatabase: .none
        )
        
        do {
            return try ModelContainer(for: schema, configurations: config)
        } catch {
            fatalError("Failed to create shared model container: \(error)")
        }
    }()
}

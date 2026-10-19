//
//  APIList.swift
//  Nylon Impossible
//

import Foundation

/// A list (Today/This Week/Someday, or a custom list) as returned by the
/// server. Mirrors `src/api/src/handlers/lists.ts`'s `serializeList`.
struct APIList: Codable, Sendable, Identifiable {
    let id: String
    let userId: String
    let name: String
    let kind: String        // "system" | "custom"
    let systemKind: String? // "today" | "thisWeek" | "someday" | nil for custom
    let position: String
    let createdAt: Date
    let updatedAt: Date
}

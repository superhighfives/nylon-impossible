//
//  TodoSuggestion.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 8/7/26.
//

import Foundation
import SwiftData

/// A proposed AI enrichment change awaiting the user's consent. Server-
/// authoritative — the client never creates one locally, only upserts what
/// sync sends and pushes accept/dismiss. Terminal once accepted or dismissed;
/// re-running enrich supersedes any suggestions still pending.
@Model
final class TodoSuggestion {
    var id: String
    var type: String     // "due_date" | "recurrence" | "title" | "subtasks" | "research"
    var label: String    // Pre-rendered human string for the button
    var status: String   // "pending" | "accepted" | "dismissed"
    var createdAt: Date
    var updatedAt: Date

    // Raw payload fields, mirroring APISuggestionPayload. Which are set
    // depends on `type`.
    var payloadDueDate: String?
    var payloadRecurrenceFrequency: String?
    var payloadTitle: String?
    var payloadTitles: [String]?
    var payloadSearchQuery: String?
    var payloadResearchType: String?

    // Inverse relationship — mirrors TodoMessage.todo.
    @Relationship(inverse: \TodoItem.suggestions) var todo: TodoItem?

    init(
        id: String,
        type: String,
        label: String,
        status: String,
        createdAt: Date,
        updatedAt: Date,
        payloadDueDate: String? = nil,
        payloadRecurrenceFrequency: String? = nil,
        payloadTitle: String? = nil,
        payloadTitles: [String]? = nil,
        payloadSearchQuery: String? = nil,
        payloadResearchType: String? = nil
    ) {
        self.id = id
        self.type = type
        self.label = label
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.payloadDueDate = payloadDueDate
        self.payloadRecurrenceFrequency = payloadRecurrenceFrequency
        self.payloadTitle = payloadTitle
        self.payloadTitles = payloadTitles
        self.payloadSearchQuery = payloadSearchQuery
        self.payloadResearchType = payloadResearchType
    }

    var isPending: Bool { status == "pending" }
}

//
//  TodoMessage.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 6/7/26.
//

import Foundation
import SwiftData

/// A single turn in a todo's conversation thread. Messages are append-only and
/// immutable except for `awaitingReply`, which clears (to false) when the user
/// replies or dismisses. `isSynced` is false for locally-created user replies
/// that still need to be pushed to the server via the reply endpoint.
@Model
final class TodoMessage {
    var id: String
    var role: String       // "assistant" | "user"
    var content: String
    var createdAt: Date
    var awaitingReply: Bool
    var isSynced: Bool

    // Inverse relationship — lets a standalone TodoMessage navigate to its
    // parent (and supply the todoId when pushing a reply) without a redundant
    // stored todoId. Mirrors TodoUrl.todo.
    @Relationship(inverse: \TodoItem.messages) var todo: TodoItem?

    init(
        id: String = UUID().uuidString.lowercased(),
        role: String,
        content: String,
        createdAt: Date = Date(),
        awaitingReply: Bool = false,
        isSynced: Bool = false
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.createdAt = createdAt
        self.awaitingReply = awaitingReply
        self.isSynced = isSynced
    }
}

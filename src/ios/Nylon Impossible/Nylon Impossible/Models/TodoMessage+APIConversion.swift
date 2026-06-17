//
//  TodoMessage+APIConversion.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 6/7/26.
//

import Foundation

extension TodoMessage {
    /// Build a synced message from the server's sync payload.
    convenience init(from api: APITodoMessage) {
        self.init(
            id: api.id,
            role: api.role,
            content: api.content,
            createdAt: api.createdAt,
            awaitingReply: api.awaitingReply,
            isSynced: true
        )
    }
}

extension APITodoMessage {
    init(from stored: TodoMessage, todoId: String) {
        self.init(
            id: stored.id,
            todoId: todoId,
            role: stored.role,
            content: stored.content,
            createdAt: stored.createdAt,
            awaitingReply: stored.awaitingReply
        )
    }
}

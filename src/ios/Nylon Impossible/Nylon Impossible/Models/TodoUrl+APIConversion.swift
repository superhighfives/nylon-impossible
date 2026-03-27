//
//  TodoUrl+APIConversion.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/26/26.
//

import Foundation

extension TodoUrl {
    convenience init(from api: APITodoUrl) {
        self.init(
            id: api.id,
            url: api.url,
            title: api.title,
            itemDescription: api.description,
            siteName: api.siteName,
            favicon: api.favicon,
            position: api.position,
            fetchStatus: api.fetchStatus.rawValue,
            fetchedAt: api.fetchedAt,
            createdAt: api.createdAt,
            updatedAt: api.updatedAt
        )
    }
}

extension APITodoUrl {
    init(from stored: TodoUrl, todoId: String) {
        self.init(
            id: stored.id,
            todoId: todoId,
            url: stored.url,
            title: stored.title,
            description: stored.itemDescription,
            siteName: stored.siteName,
            favicon: stored.favicon,
            position: stored.position,
            fetchStatus: FetchStatus(rawValue: stored.fetchStatus) ?? .pending,
            fetchedAt: stored.fetchedAt,
            createdAt: stored.createdAt,
            updatedAt: stored.updatedAt
        )
    }
}

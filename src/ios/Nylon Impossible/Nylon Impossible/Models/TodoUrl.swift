//
//  TodoUrl.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/26/26.
//

import Foundation
import SwiftData

@Model
final class TodoUrl {
    var id: String
    var url: String
    var title: String?
    var itemDescription: String?
    var siteName: String?
    var favicon: String?
    var position: String
    var fetchStatus: String      // "pending" | "fetched" | "failed"
    var fetchedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    // Inverse relationship — required so a standalone TodoUrl can navigate to its parent
    // without needing a redundant todoId string. SwiftData uses this to maintain referential
    // integrity; `todo` is nil only transiently (between insert and the relationship being set).
    @Relationship(inverse: \TodoItem.urls) var todo: TodoItem?

    init(from api: APITodoUrl) {
        id = api.id
        url = api.url
        title = api.title
        itemDescription = api.description
        siteName = api.siteName
        favicon = api.favicon
        position = api.position
        fetchStatus = api.fetchStatus.rawValue
        fetchedAt = api.fetchedAt
        createdAt = api.createdAt
        updatedAt = api.updatedAt
    }
}

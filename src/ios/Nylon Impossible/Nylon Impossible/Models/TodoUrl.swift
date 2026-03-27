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

    init(
        id: String, url: String, title: String?, itemDescription: String?,
        siteName: String?, favicon: String?, position: String, fetchStatus: String,
        fetchedAt: Date?, createdAt: Date, updatedAt: Date
    ) {
        self.id = id
        self.url = url
        self.title = title
        self.itemDescription = itemDescription
        self.siteName = siteName
        self.favicon = favicon
        self.position = position
        self.fetchStatus = fetchStatus
        self.fetchedAt = fetchedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

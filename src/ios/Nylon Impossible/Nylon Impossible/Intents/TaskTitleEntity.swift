//
//  TaskTitleEntity.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/13/26.
//

import AppIntents

/// Wrapper entity for free-form task titles, enabling inline Siri phrases like "Add buy milk to Nylon"
struct TaskTitle: AppEntity {
    var id: String
    var title: String
    
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Task"
    
    static var defaultQuery = TaskTitleQuery()
    
    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)")
    }
    
    init(id: String = UUID().uuidString, title: String) {
        self.id = id
        self.title = title
    }
}

/// Query that accepts any spoken string as a valid task title
struct TaskTitleQuery: EntityStringQuery {
    func entities(matching string: String) async throws -> [TaskTitle] {
        // Accept any free-form text as a valid task title
        [TaskTitle(title: string)]
    }
    
    func entities(for identifiers: [String]) async throws -> [TaskTitle] {
        // Not used for free-form input
        []
    }
    
    func suggestedEntities() async throws -> [TaskTitle] {
        // Could return recent tasks here for Siri suggestions
        []
    }
}

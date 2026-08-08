//
//  TodoSuggestion+APIConversion.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 8/7/26.
//

import Foundation

extension TodoSuggestion {
    /// Build a suggestion from the server's sync payload.
    convenience init(from api: APITodoSuggestion) {
        self.init(
            id: api.id,
            type: api.type,
            label: api.label,
            status: api.status,
            createdAt: api.createdAt,
            updatedAt: api.updatedAt,
            payloadDueDate: api.payload.dueDate,
            payloadRecurrenceFrequency: api.payload.recurrence?.frequency.rawValue,
            payloadTitle: api.payload.title,
            payloadTitles: api.payload.titles,
            payloadSearchQuery: api.payload.searchQuery,
            payloadResearchType: api.payload.researchType
        )
    }

    /// Apply the fields this suggestion type maps directly onto a todo. Mirrors
    /// the server's accept handler for the single-field types (title/due_date/
    /// recurrence) — subtasks and research create new rows server-side, so
    /// those are left for the next sync rather than synthesized locally.
    func applyLocally(to todo: TodoItem) {
        switch type {
        case "title":
            if let payloadTitle { todo.title = payloadTitle }
        case "due_date":
            if let payloadDueDate {
                let formatter = ISO8601DateFormatter()
                formatter.formatOptions = [.withFullDate]
                todo.dueDate = formatter.date(from: payloadDueDate)
            }
        case "recurrence":
            if let payloadRecurrenceFrequency,
               let frequency = RecurrenceFrequency(rawValue: payloadRecurrenceFrequency) {
                todo.recurrence = Recurrence(frequency: frequency)
            }
        default:
            break
        }
    }
}

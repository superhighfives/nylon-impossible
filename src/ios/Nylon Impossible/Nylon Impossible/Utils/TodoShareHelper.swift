//
//  TodoShareHelper.swift
//  Nylon Impossible
//

import Foundation

func shareText(for todo: TodoItem, urls: [APITodoUrl]) -> String {
    var lines: [String] = [todo.title]
    if let description = todo.itemNotes, !description.isEmpty {
        lines.append(description)
    }
    if let dueDate = todo.dueDate {
        lines.append("Due: \(dueDate.formatted(date: .abbreviated, time: .omitted))")
    }
    if !urls.isEmpty {
        lines.append(contentsOf: urls.map { $0.url })
    }
    return lines.joined(separator: "\n")
}

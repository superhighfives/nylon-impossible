//
//  TodoText.swift
//  Nylon Impossible
//
//  Swift mirror of `splitTodoText` in src/shared/src/todo-text.ts, plus the
//  composer's multi-line paste rule. Keep the split in step with the TS one:
//  a title that fits passes through, anything longer keeps its full text in
//  notes so a long paste never fails validation or loses words.
//

import Foundation

enum TodoText {
    /// Longest title the API accepts.
    static let titleMax = 500
    /// Longest notes the API accepts.
    static let notesMax = 10_000
    /// Target length for a title cut from overflowing text.
    private static let overflowTitleLength = 120

    struct Split: Equatable {
        let title: String
        let notes: String?
    }

    /// Split free-form text into a title that fits and notes that keep the rest.
    static func split(_ text: String) -> Split {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let newline = trimmed.firstIndex(of: "\n")
        if newline == nil, trimmed.count <= titleMax {
            return Split(title: trimmed, notes: nil)
        }

        if let newline {
            let firstLine = trimmed[..<newline].trimmingCharacters(in: .whitespaces)
            let rest = trimmed[trimmed.index(after: newline)...].trimmingCharacters(in: .whitespacesAndNewlines)
            if !firstLine.isEmpty, firstLine.count <= titleMax {
                return Split(title: firstLine, notes: rest.isEmpty ? nil : capNotes(rest))
            }
        }

        let notes = capNotes(trimmed)
        if !trimmed.contains(where: \.isWhitespace),
           trimmed.range(of: "^https?://", options: [.regularExpression, .caseInsensitive]) != nil,
           let host = URL(string: trimmed)?.host {
            return Split(title: host, notes: notes)
        }

        let firstLine = trimmed
            .split(separator: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .first { !$0.isEmpty } ?? trimmed
        return Split(title: clip(firstLine, to: overflowTitleLength), notes: notes)
    }

    /// The composer's rule for what it's holding: one todo per non-empty line,
    /// each split on its own.
    static func entries(fromDraft draft: String) -> [Split] {
        draft
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .map { split($0) }
    }

    private static func clip(_ text: String, to max: Int) -> String {
        guard text.count > max else { return text }
        let head = String(text.prefix(max - 1))
        var cut = head
        if let space = head.range(of: " ", options: .backwards),
           head.distance(from: head.startIndex, to: space.lowerBound) > Int(Double(max) * 0.6) {
            cut = String(head[..<space.lowerBound])
        }
        return cut.trimmingCharacters(in: .whitespaces) + "…"
    }

    private static func capNotes(_ text: String) -> String {
        guard text.utf16.count > notesMax else { return text }
        var result = ""
        var count = 0
        for character in text {
            let size = character.utf16.count
            if count + size > notesMax { break }
            result.append(character)
            count += size
        }
        return result
    }
}

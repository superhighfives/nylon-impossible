//
//  ScreenRoute+NotesMax.swift
//  Nylon Impossible
//
//  `-NylonScreen notesmax`: the detail sheet of the Lisbon trip, as
//  `detail` opens it, with its notes just under the limit and the cursor in
//  them, so the label's line shows the count, and the limit's toast up.
//  Split from ScreenRoute.swift to keep it under SwiftLint's length limit.
//

#if DEBUG
import Foundation
import SwiftData

extension SampleData {
    /// The Lisbon trip's notes, padded to 37 units under the limit: the
    /// count shows from 90,000.
    static func fillNotes(_ context: ModelContext) {
        let trips = (try? context.fetch(FetchDescriptor<TodoItem>(
            predicate: #Predicate { $0.title == "Plan Lisbon trip" }
        ))) ?? []
        guard let trip = trips.first, let notes = trip.itemNotes else { return }
        // One long paragraph: thousands of list items would take the
        // drawn notes longer to lay out than a screenshot waits.
        let day = "Walk up to the Miradouro da Graça before breakfast, then lunch in Alfama and the tram back."
        let days = Array(repeating: day, count: TodoText.notesMax / day.utf16.count + 1)
        let padded = notes + "\n\n" + days.joined(separator: " ")
        trip.itemNotes = TodoText.capNotes(padded, max: TodoText.notesMax - 37)
        try? context.save()
    }
}

extension ToastCenter {
    /// The limit's toast, up for the whole run so a screenshot can't miss it.
    func showNotesLimitForScreenshot() {
        duration = .seconds(3600)
        show(NotesLimit.message, action: nil)
    }
}
#endif

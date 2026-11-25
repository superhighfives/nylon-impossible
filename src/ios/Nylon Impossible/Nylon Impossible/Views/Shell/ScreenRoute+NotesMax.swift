//
//  ScreenRoute+NotesMax.swift
//  Nylon Impossible
//
//  `-NylonScreen notesmax`: the detail sheet of the Lisbon trip, as
//  `detail` opens it, with its notes just under the limit and the cursor in
//  them, so the label's line shows the count, and the limit's toast up.
//  `notescode` is the same sheet with a note of headings, a list and code
//  blocks, and `notescodeedit` with the cursor in it (#835).
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

    /// The SSH fingerprints note (#835): a paragraph, a `#` heading and a
    /// plain "Air" line, a list, inline bold, and three code blocks, with
    /// and without blank lines beside them, the last one ending the note.
    static let codeNote = """
        Fingerprints for the new machines, to check on first connect.

        # Work
        ```
        SHA256:Xk3v8Qm1Zp7rT2bN9cW4yL6dF0hJ5sA8uE1gR3tY7iO
        ```
        Air
        ```
        SHA256:mP4qW8eR2tY6uI0oP3aS7dF1gH5jK9lZ2xC6vB0nM4q
        ```

        Mini, added **Tuesday**:
        - ed25519 for the login
        - rsa only for the old NAS

        ```
        SHA256:a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0u1V
        ```
        """

    /// The Lisbon trip, which `detail` opens, with `codeNote` for notes.
    static func codeNotes(_ context: ModelContext) {
        let trips = (try? context.fetch(FetchDescriptor<TodoItem>(
            predicate: #Predicate { $0.title == "Plan Lisbon trip" }
        ))) ?? []
        guard let trip = trips.first else { return }
        trip.itemNotes = codeNote
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

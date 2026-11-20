//
//  NotesShortcutsUITests.swift
//  Nylon ImpossibleUITests
//
//  ⌘B, ⌘I and ⌘E in the open todo's notes with a hardware keyboard (#732):
//  they wrap, insert at the caret and unwrap as on the web, ⌘Z undoes each
//  in one step, and the result saves like typing.
//

import XCTest

final class NotesShortcutsUITests: NylonUITestCase {
    private var notes: XCUIElement { app.textFields["Notes"].firstMatch }

    private var value: String { notes.value as? String ?? "" }

    private func expectNotes(_ expected: String, file: StaticString = #filePath, line: UInt = #line) {
        let matches = NSPredicate(format: "value == %@", expected)
        let result = XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: matches, object: notes)], timeout: 3)
        XCTAssertEqual(result, .completed, "notes read \(value.debugDescription), not \(expected.debugDescription)", file: file, line: line)
    }

    /// The detail route opens "Plan Lisbon trip", whose notes are drawn
    /// over the field; tapping them edits.
    private func editNotes() {
        let drawn = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "pastelaria")).firstMatch
        waitFor(drawn, timeout: 10)
        drawn.tap()
        waitFor(notes)
        if !notes.hasKeyboardFocusNow { notes.tap() }
        let focused = NSPredicate(format: "hasKeyboardFocus == true")
        let result = XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: focused, object: notes)], timeout: 3)
        XCTAssertEqual(result, .completed, "the notes never took the cursor")
    }

    private func press(_ key: String, _ modifiers: XCUIElement.KeyModifierFlags = .command) {
        notes.typeKey(key, modifierFlags: modifiers)
    }

    func testShortcutsWrapUnwrapUndoAndSave() {
        launch("detail")
        editNotes()

        press("a")
        notes.typeText("Fancy chair")
        expectNotes("Fancy chair")

        // Wrap the selection, then unwrap it: the selection stays on the text
        // inside the markers.
        press("a")
        press("b")
        expectNotes("**Fancy chair**")
        press("b")
        expectNotes("Fancy chair")

        // ⌘Z takes the last shortcut back in one step.
        press("z")
        expectNotes("**Fancy chair**")

        // ⌘I on bold adds italic rather than eating the bold.
        press("i")
        expectNotes("***Fancy chair***")
        press("z")
        expectNotes("**Fancy chair**")

        // With no selection, the pair goes in with the caret between.
        press("a")
        notes.typeText("Run ")
        press("e")
        notes.typeText("ls")
        expectNotes("Run `ls`")

        // Saves like typing: close the sheet and open the todo again.
        // Wait for the sheet's own field to go, not for the row to be
        // hittable: asked mid-dismissal, isHittable fails the test outright.
        for _ in 0..<3 where notes.exists {
            let top = app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12))
            top.press(forDuration: 0.05, thenDragTo: top.withOffset(CGVector(dx: 0, dy: 700)))
            _ = notes.waitForNonExistence(timeout: 2)
        }
        let row = row("Plan Lisbon trip")
        waitFor(row)
        // The row counts the saved notes' words.
        XCTAssertTrue(row.label.contains("Notes, 2 words") || (row.value as? String)?.contains("Notes, 2 words") == true,
                      "the row doesn't show the saved notes: \(row.label)")
        row.tap()
        // Drawn, the code loses its backticks.
        waitFor(app.buttons["Run ls"])
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "pastelaria")).firstMatch.exists)
    }
}

private extension XCUIElement {
    var hasKeyboardFocusNow: Bool { (value(forKey: "hasKeyboardFocus") as? Bool) ?? false }
}

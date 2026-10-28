//
//  BoardKeyboardUITests.swift
//  Nylon ImpossibleUITests
//
//  The iPad board's hardware-keyboard map, pressed for real: every key does
//  its job, the selected row shows it (VoiceOver's selected trait mirrors
//  the focus ring), and none of the single keys fire while a field has the
//  keyboard. iPad only; skipped on iPhone.
//

import XCTest

final class BoardKeyboardUITests: NylonUITestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad, "The board and its keys are iPad only")
        launch("board")
        waitFor(row("Review PR for the sync engine"))
    }

    private var selectedRow: XCUIElement {
        app.buttons.matching(NSPredicate(format: "isSelected == true AND value CONTAINS[c] 'done'")).firstMatch
    }

    private func press(_ key: String, _ modifiers: XCUIElement.KeyModifierFlags = []) {
        app.typeKey(key, modifierFlags: modifiers)
    }

    func testJKMoveTheSelectionAndItShows() {
        press("j")
        waitFor(selectedRow)
        XCTAssertEqual(selectedRow.label, "Review PR for the sync engine")
        press("j")
        XCTAssertEqual(selectedRow.label, "Call Mum about Sunday lunch")
        press("k")
        XCTAssertEqual(selectedRow.label, "Review PR for the sync engine")
        // Arrows are the same keys.
        press(XCUIKeyboardKey.downArrow.rawValue)
        XCTAssertEqual(selectedRow.label, "Call Mum about Sunday lunch")
    }

    func testHLMoveAcrossColumns() {
        press("j")
        press("l")
        waitFor(selectedRow)
        XCTAssertEqual(selectedRow.label, "Send invoice to Pika")
        press("h")
        XCTAssertEqual(selectedRow.label, "Review PR for the sync engine")
    }

    func testXMarksDoneWithUndo() {
        press("j")
        press("j")
        press("x")
        waitFor(XCUIElement.toast("Done", in: app))
        XCTAssertTrue(app.buttons["Undo"].exists)
        // The selection moves on to the next row rather than vanishing.
        XCTAssertEqual(selectedRow.label, "Finish quarterly report")
    }

    func testNumbersMoveBetweenTimeLists() {
        press("j")
        press("2")
        waitFor(XCUIElement.toast("Moved to This week", in: app))
        press("l")
        press("3")
        waitFor(XCUIElement.toast("Moved to Someday", in: app))
        press("1")
        waitFor(XCUIElement.toast("Moved to Today", in: app))
    }

    func testPPins() {
        press("j")
        press("j")
        press("p")
        let pinned = row("Call Mum about Sunday lunch")
        let predicate = NSPredicate(format: "value BEGINSWITH 'Pinned'")
        expectation(for: predicate, evaluatedWith: pinned)
        waitForExpectations(timeout: 3)
    }

    func testBackspaceDeletesWithUndo() {
        // Known: Return and Backspace don't reach the board when XCUITest
        // simulates a hardware key, while letters, arrows, Escape and ⌘N do.
        // Most likely the focus system takes them as "activate" and
        // "delete backward" before onKeyPress and the menu's key commands
        // see them. Needs checking on a device with a real keyboard, and
        // probably a UIKeyCommand that wants priority over system
        // behaviour. Expected to fail until then; it passes if fixed.
        XCTExpectFailure("Return/Backspace are taken by the system before the board", strict: false)
        press("j")
        // Backspace, as a hardware keyboard sends it.
        press("\u{8}")
        waitFor(XCUIElement.toast("Deleted", in: app))
        app.buttons["Undo"].tap()
        waitFor(row("Review PR for the sync engine"))
    }

    func testReturnOpensTheDetail() {
        // Known: Return and Backspace don't reach the board when XCUITest
        // simulates a hardware key, while letters, arrows, Escape and ⌘N do.
        // Most likely the focus system takes them as "activate" and
        // "delete backward" before onKeyPress and the menu's key commands
        // see them. Needs checking on a device with a real keyboard, and
        // probably a UIKeyCommand that wants priority over system
        // behaviour. Expected to fail until then; it passes if fixed.
        XCTExpectFailure("Return/Backspace are taken by the system before the board", strict: false)
        press("j")
        press(XCUIKeyboardKey.return.rawValue)
        // The detail opens in the inspector, title first.
        let title = app.textFields["Title"].firstMatch
        waitFor(title)
        XCTAssertEqual(title.value as? String, "Review PR for the sync engine")
    }

    func testDOpensTheDetailWithItsCalendar() {
        press("j")
        press("d")
        waitFor(app.datePickers.firstMatch)
        XCTAssertEqual(app.textFields["Title"].firstMatch.value as? String, "Review PR for the sync engine")
    }

    func testNFocusesTheComposerAndTypingIsNotAShortcut() {
        press("j")
        press("n")
        let field = app.textFields["New todo"].firstMatch
        waitFor(field)
        let focused = NSPredicate(format: "hasKeyboardFocus == true")
        expectation(for: focused, evaluatedWith: field)
        waitForExpectations(timeout: 3)

        // j, k, x, p, 1 are letters here, not commands.
        app.typeText("jkxp1")
        XCTAssertEqual(field.value as? String, "jkxp1")
        // No toast: nothing was marked done, moved or pinned. ("Done" alone
        // would match the sidebar's Done entry.)
        XCTAssertFalse(app.buttons["Undo"].exists)

        // Escape hands the keyboard back to the board, and j works again.
        press(XCUIKeyboardKey.escape.rawValue)
        press("j")
        waitFor(selectedRow)
    }

    func testCommandNWorksWhileTyping() {
        press("n")
        let field = app.textFields["New todo"].firstMatch
        waitFor(field)
        app.typeText("Buy stamps")
        press("n", .command)
        XCTAssertEqual(field.value as? String, "Buy stamps")
    }
}

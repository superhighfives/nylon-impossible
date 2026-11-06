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
        // simulates a hardware key (nor does Esc), while letters, arrows and ⌘N do.
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
        // simulates a hardware key (nor does Esc), while letters, arrows and ⌘N do.
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

    func testNTypesInTheColumnsAddAndTypingIsNotAShortcut() {
        // Known: Esc doesn't reach the app when XCUITest simulates it on
        // iPad, as with Return and Backspace below. Log markers showed no Esc
        // at onKeyPress, and the board's Esc key command (`EscapeKey`) didn't
        // fire either. Needs checking on a device with a real keyboard.
        // Expected to fail until then; it passes if fixed.
        XCTExpectFailure("Esc isn't delivered to the app under XCUITest", strict: false)
        press("j")
        // n is "add here": typing in Today's Add, not quick add.
        press("n")
        let field = app.textFields.matching(NSPredicate(format: "hasKeyboardFocus == true")).firstMatch
        waitFor(field)
        XCTAssertFalse(app.staticTexts["Return adds and keeps this open · Esc closes"].exists)

        // j, k, x, p, 1 are letters here, not commands.
        app.typeText("jkxp1")
        XCTAssertEqual(field.value as? String, "jkxp1")
        // No toast: nothing was marked done, moved or pinned. ("Done" alone
        // would match the sidebar's Done entry.)
        XCTAssertFalse(app.buttons["Undo"].exists)

        // Esc stops typing and stays on Add; ↓ goes on to the first todo.
        press(XCUIKeyboardKey.escape.rawValue)
        expectation(for: NSPredicate(format: "hasKeyboardFocus == false"), evaluatedWith: field)
        waitForExpectations(timeout: 3)
        press("j")
        waitFor(selectedRow)
        XCTAssertEqual(selectedRow.label, "Review PR for the sync engine")
    }

    func testNInDoneOpensQuickAdd() {
        // Today, then This week, Someday and Done.
        for _ in 0..<3 { press(XCUIKeyboardKey.tab.rawValue) }
        press("n")
        waitFor(app.staticTexts["Return adds and keeps this open · Esc closes"])
    }

    // MARK: - Two levels, jumps, palette

    func testLeftFromTheFirstColumnReachesTheSidebarAndRightGoesBackIn() {
        press("j")
        press("h")
        // In the sidebar, on Today: down to This week, then into it.
        press("j")
        press("l")
        waitFor(selectedRow)
        XCTAssertEqual(selectedRow.label, "Send invoice to Pika")
    }

    func testLeftIntoTheSidebarLetsGoOfTheTodoAndRightReselectsIt() {
        press("j")
        waitFor(selectedRow)
        let first = selectedRow.label
        // ← from the first column lets go of the todo, as Esc does…
        press("h")
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: selectedRow)
        waitForExpectations(timeout: 3)
        // …and → goes back in to the column's last one.
        press("l")
        waitFor(selectedRow)
        XCTAssertEqual(selectedRow.label, first)
    }

    func testEscapeClosesTheTodoThenStepsOutOfTheColumn() {
        // Known: Esc doesn't reach the app when XCUITest simulates it on
        // iPad, as with Return and Backspace below. Log markers showed no Esc
        // at onKeyPress, and the board's Esc key command (`EscapeKey`) didn't
        // fire either. Needs checking on a device with a real keyboard.
        // Expected to fail until then; it passes if fixed.
        XCTExpectFailure("Esc isn't delivered to the app under XCUITest", strict: false)
        let review = row("Review PR for the sync engine")
        review.tap()
        review.tap()
        let detail = app.staticTexts["Notes"].firstMatch
        waitFor(detail)
        press(XCUIKeyboardKey.escape.rawValue)
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: detail)
        waitForExpectations(timeout: 3)
        // Back on its row; Esc again steps out to the column, deselecting.
        XCTAssertEqual(selectedRow.label, "Review PR for the sync engine")
        press(XCUIKeyboardKey.escape.rawValue)
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: selectedRow)
        waitForExpectations(timeout: 3)
        // On Today: ← is the sidebar, and → comes back to Today.
        press("h")
        press("l")
        press("j")
        XCTAssertEqual(selectedRow.label, "Review PR for the sync engine")
    }

    func testShiftDigitsJumpToColumnsAndLists() {
        press("j")
        press("2", .shift)
        waitFor(selectedRow)
        XCTAssertEqual(selectedRow.label, "Send invoice to Pika")
        press("4", .shift)
        waitFor(row("Parmesan"))
        XCTAssertEqual(selectedRow.label, "Parmesan")
        press("1", .shift)
        XCTAssertEqual(selectedRow.label, "Review PR for the sync engine")
    }

    func testGThenALetterJumps() {
        press("j")
        press("g")
        press("s")
        waitFor(row("Repaint the hallway"))
        XCTAssertEqual(selectedRow.label, "Repaint the hallway")
        // Any other key after G cancels it and does its usual job.
        press("g")
        press("j")
        XCTAssertEqual(selectedRow.label, "Learn to make sourdough")
    }

    func testCommandKSearchesAndGoesToATodo() {
        let field = app.textFields["Search todos, lists and commands…"].firstMatch
        let focused = NSPredicate(format: "hasKeyboardFocus == true")
        press("k", .command)
        waitFor(field)
        expectation(for: focused, evaluatedWith: field)
        waitForExpectations(timeout: 3)
        // ⌘K again closes it; a third time opens a fresh field, focused too.
        press("k", .command)
        XCTAssertTrue(field.waitForNonExistence(timeout: 3))
        press("k", .command)
        waitFor(field)
        expectation(for: focused, evaluatedWith: field)
        waitForExpectations(timeout: 3)
        app.typeText("parm\n")
        waitFor(row("Parmesan"))
        XCTAssertEqual(selectedRow.label, "Parmesan")
    }

    func testSearchButtonFocusesTheField() {
        app.buttons["Search and commands"].firstMatch.tap()
        let field = app.textFields["Search todos, lists and commands…"].firstMatch
        waitFor(field)
        expectation(for: NSPredicate(format: "hasKeyboardFocus == true"), evaluatedWith: field)
        waitForExpectations(timeout: 3)
    }

    func testMMovesTheSelectionToAList() {
        press("j")
        press("m")
        waitFor(app.staticTexts["Move “Review PR for the sync engine”"])
        app.typeText("groc\n")
        waitFor(XCUIElement.toast("Moved to Groceries", in: app))
    }

    func testQuestionMarkListsTheShortcuts() {
        press("/", .shift)
        waitFor(app.staticTexts["Keyboard shortcuts"].firstMatch)
        XCTAssertTrue(app.staticTexts["Move to a list…"].exists)
        XCTAssertTrue(app.staticTexts["⇧1 or G T"].exists)
    }

    func testOSaysWhenATodoHasNoLink() {
        press("j")
        press("j")
        press("o")
        waitFor(XCUIElement.toast("No link on this todo", in: app))
    }

    func testShiftNOpensNewList() {
        press("n", .shift)
        waitFor(app.textFields["Name"].firstMatch)
    }

    func testCommandNWorksWhileTyping() {
        press("n")
        let field = app.textFields.matching(NSPredicate(format: "hasKeyboardFocus == true")).firstMatch
        waitFor(field)
        app.typeText("Buy stamps")
        // ⌘N is always quick add, even from a column's Add.
        press("n", .command)
        waitFor(app.staticTexts["Return adds and keeps this open · Esc closes"])
        XCTAssertTrue(app.textFields.matching(NSPredicate(format: "value == 'Buy stamps'")).firstMatch.exists)
    }

    // MARK: - Sections

    private func tab(_ times: Int = 1, back: Bool = false) {
        for _ in 0..<times { press(XCUIKeyboardKey.tab.rawValue, back ? .shift : []) }
    }

    func testTabVisitsTheSectionsInOrderAndWraps() {
        // On Today at launch. Each Tab lands on a section with nothing
        // selected; j steps in at its first todo.
        tab()
        press("j")
        waitFor(selectedRow)
        XCTAssertEqual(selectedRow.label, "Send invoice to Pika")
        tab()
        XCTAssertFalse(selectedRow.exists)
        press("j")
        XCTAssertEqual(selectedRow.label, "Repaint the hallway")
        // Done, the sidebar, then round to Today and This week: six in all.
        tab(3)
        press("j")
        XCTAssertEqual(selectedRow.label, "Review PR for the sync engine")
        tab()
        press("j")
        XCTAssertEqual(selectedRow.label, "Send invoice to Pika")
    }

    func testShiftTabGoesBackAndWraps() {
        // From Today: the sidebar, Done, then Someday.
        tab(3, back: true)
        press("j")
        waitFor(selectedRow)
        XCTAssertEqual(selectedRow.label, "Repaint the hallway")
        tab(back: true)
        press("j")
        XCTAssertEqual(selectedRow.label, "Send invoice to Pika")
        tab(back: true)
        press("j")
        XCTAssertEqual(selectedRow.label, "Review PR for the sync engine")
        // The sixth goes round to the sidebar; → from it is Today.
        tab(back: true)
        XCTAssertFalse(selectedRow.exists)
        press("l")
        press("j")
        XCTAssertEqual(selectedRow.label, "Review PR for the sync engine")
    }

    func testLeftAndRightOnASectionMoveToTheNextSection() {
        // This week, then ← to Today and → back.
        tab()
        press("h")
        press("j")
        waitFor(selectedRow)
        XCTAssertEqual(selectedRow.label, "Review PR for the sync engine")
    }

    func testUpFromTheFirstTodoReachesAddAndDownComesBack() {
        tab()
        press("j")
        waitFor(selectedRow)
        XCTAssertEqual(selectedRow.label, "Send invoice to Pika")
        // ↑ to Add: no row is selected.
        press("k")
        XCTAssertFalse(selectedRow.exists)
        press("j")
        XCTAssertEqual(selectedRow.label, "Send invoice to Pika")
    }

    func testNOnASectionTypesInItsAdd() {
        tab()
        press("n")
        let field = app.textFields.matching(NSPredicate(format: "hasKeyboardFocus == true")).firstMatch
        waitFor(field)
        app.typeText("Stamps")
        XCTAssertEqual(field.value as? String, "Stamps")
    }

    func testReturnOpensTheTodoWithoutEditingItAndRowKeysActOnIt() {
        // Known: Return doesn't reach the board under XCUITest on iPad (see
        // testReturnOpensTheDetail). Expected to fail until then.
        XCTExpectFailure("Return/Esc are taken by the system before the board", strict: false)
        tab()
        press(XCUIKeyboardKey.return.rawValue)
        waitFor(selectedRow)
        XCTAssertEqual(selectedRow.label, "Send invoice to Pika")
        press(XCUIKeyboardKey.return.rawValue)
        let title = app.textFields["Title"].firstMatch
        waitFor(title)
        // On the todo, not in it: p pins and nothing is typed.
        XCTAssertFalse(NSPredicate(format: "hasKeyboardFocus == true").evaluate(with: title))
        press("p")
        expectation(for: NSPredicate(format: "value BEGINSWITH 'Pinned'"), evaluatedWith: row("Send invoice to Pika"))
        waitForExpectations(timeout: 3)
        XCTAssertEqual(title.value as? String, "Send invoice to Pika")
        // Return steps in to the title; Esc out; Esc again closes, on the row.
        press(XCUIKeyboardKey.return.rawValue)
        expectation(for: NSPredicate(format: "hasKeyboardFocus == true"), evaluatedWith: title)
        waitForExpectations(timeout: 3)
        press(XCUIKeyboardKey.tab.rawValue)
        XCTAssertFalse(NSPredicate(format: "hasKeyboardFocus == true").evaluate(with: title))
        press(XCUIKeyboardKey.escape.rawValue)
        press(XCUIKeyboardKey.escape.rawValue)
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: title)
        waitForExpectations(timeout: 3)
        XCTAssertEqual(selectedRow.label, "Send invoice to Pika")
    }
}

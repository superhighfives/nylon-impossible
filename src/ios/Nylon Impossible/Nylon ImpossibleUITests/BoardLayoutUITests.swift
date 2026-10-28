//
//  BoardLayoutUITests.swift
//  Nylon ImpossibleUITests
//
//  The board's layout, clicked for real: four columns whose fourth rests on
//  Done, one click selects and a second opens the todo there, the detail
//  follows the selection, your list opens in the fourth column (and × goes
//  back to Done), and deleting a list happens straight away with Undo.
//  iPad only; skipped on iPhone.
//

import XCTest

final class BoardLayoutUITests: NylonUITestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad, "The board is iPad only")
        launch("board")
        waitFor(row("Review PR for the sync engine"))
    }

    /// The detail's own labels, which only it draws.
    private var detail: XCUIElement { app.staticTexts["Notes"].firstMatch }

    private func sidebar(_ name: String) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label == %@", name)).firstMatch
    }

    func testTheFourthColumnRestsOnDone() {
        waitFor(app.staticTexts["Finished todos, by day"])
        XCTAssertTrue(sidebar("Done").isSelected)
    }

    func testOneClickSelectsAndASecondOpens() {
        let lisbon = row("Plan Lisbon trip")
        lisbon.tap()
        XCTAssertTrue(lisbon.isSelected)
        XCTAssertFalse(detail.exists, "One click only selects")

        lisbon.tap()
        waitFor(detail)
        // The detail took Done's place; the time columns stay.
        XCTAssertFalse(app.staticTexts["Finished todos, by day"].exists)
        XCTAssertTrue(row("Review PR for the sync engine").exists)
    }

    func testTheDetailFollowsTheSelection() {
        let lisbon = row("Plan Lisbon trip")
        lisbon.tap()
        lisbon.tap()
        waitFor(detail)
        app.typeKey("j", modifierFlags: [])
        let title = app.textViews.matching(NSPredicate(format: "value == %@", "Book dentist appointment")).firstMatch
        let field = app.textFields.matching(NSPredicate(format: "value == %@", "Book dentist appointment")).firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 3) || field.exists, "The detail shows the next row")
    }

    func testYourListOpensInTheFourthColumnAndCloseGoesBackToDone() {
        sidebar("Groceries").tap()
        waitFor(row("Parmesan"))
        XCTAssertTrue(sidebar("Groceries").isSelected)
        XCTAssertFalse(app.staticTexts["Finished todos, by day"].exists)

        // Clicking the open list again goes into it; it doesn't close it.
        sidebar("Groceries").tap()
        XCTAssertTrue(row("Parmesan").exists)

        app.buttons["Close Groceries"].tap()
        waitFor(app.staticTexts["Finished todos, by day"])
    }

    func testDeletingAListHappensStraightAwayWithUndo() {
        sidebar("Groceries").tap()
        waitFor(row("Parmesan"))
        app.buttons["Groceries options"].tap()
        app.buttons["Delete list"].tap()
        // Named, with how many todos went with it (done ones included).
        waitFor(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Deleted “Groceries” and")).firstMatch)
        // Gone from the sidebar (once its exit animation finishes), unconfirmed.
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: sidebar("Groceries"))
        waitForExpectations(timeout: 2)
        XCTAssertFalse(app.alerts.firstMatch.exists, "No confirmation")

        app.buttons["Undo"].tap()
        waitFor(sidebar("Groceries"))
    }
}

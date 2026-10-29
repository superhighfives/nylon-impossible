//
//  BoardDetailsUITests.swift
//  Nylon ImpossibleUITests
//
//  The board's details: "Paste a link" in the detail, and the overnight
//  pill in the space above Today's title. iPad only; skipped on iPhone.
//

import XCTest

final class BoardDetailsUITests: NylonUITestCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        try XCTSkipUnless(UIDevice.current.userInterfaceIdiom == .pad, "The board is iPad only")
    }

    func testPasteALinkRefusesTextThatIsntALink() {
        launch("board")
        let review = row("Review PR for the sync engine")
        waitFor(review)
        review.tap()
        review.tap()
        let field = app.textFields["Add a link"].firstMatch
        waitFor(field)
        field.tap()
        field.typeText("hello\n")
        waitFor(app.staticTexts["That doesn’t look like a link."])
        // Still in the field, to fix it. A real link is accepted: here, with
        // no signed-in session behind the screen route, the request fails and
        // says so (the pending card goes); signed in, the card stays and its
        // title arrives.
        let fix = app.textFields["Add a link"].firstMatch
        expectation(for: NSPredicate(format: "hasKeyboardFocus == true"), evaluatedWith: fix)
        waitForExpectations(timeout: 3)
        fix.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 5) + "visitlisboa.com\n")
        let outcome = app.descendants(matching: .any).matching(
            NSPredicate(
                format: "label CONTAINS %@ OR label == %@ OR label == %@",
                "Fetching title", "Links need a connection", "Couldn’t add the link"
            )
        ).firstMatch
        waitFor(outcome)
        XCTAssertFalse(app.staticTexts["That doesn’t look like a link."].exists)
    }

    func testTheOvernightPillGoesToThisWeekAndDismisses() {
        launch("overnight")
        let see = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "2 moved to This week")).firstMatch
        waitFor(see)
        see.tap()
        let selected = app.buttons.matching(NSPredicate(format: "isSelected == true AND value CONTAINS[c] 'done'")).firstMatch
        waitFor(selected)
        XCTAssertEqual(selected.label, "Send invoice to Pika")
        app.buttons["Dismiss overnight note"].tap()
        expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: see)
        waitForExpectations(timeout: 3)
    }
}

//
//  PhoneDoneUITests.swift
//  Nylon ImpossibleUITests
//
//  The phone's switcher and top-level pages: Done as the check beside the
//  avatar and the last page, the account sheet without it, and the banner's
//  space that keeps every title at the same height.
//

import XCTest

final class PhoneDoneUITests: NylonUITestCase {
    override func setUpWithError() throws {
        try XCTSkipIf(isPad, "The phone layout")
    }

    private var doneButton: XCUIElement { app.buttons["Done"].firstMatch }

    /// A page's masthead title: the tallest on-screen text with that label
    /// (the switcher's titles are buttons, and other pages are off screen).
    private func title(_ text: String) -> XCUIElement {
        let window = app.windows.firstMatch.frame
        let matches = app.staticTexts.matching(NSPredicate(format: "label == %@", text)).allElementsBoundByIndex
        return matches
            .filter { window.contains(CGPoint(x: $0.frame.midX, y: $0.frame.midY)) }
            .max { $0.frame.height < $1.frame.height } ?? app.staticTexts[text].firstMatch
    }

    func testDoneIsTheCheckBesideTheAvatarAndTheLastPage() {
        launch("today")
        waitFor(row("Review PR for the sync engine"))
        XCTAssertFalse(doneButton.isSelected)
        // Beside the avatar, after the titles.
        XCTAssertLessThan(app.buttons["Lists"].frame.maxX, doneButton.frame.minX)
        XCTAssertLessThan(doneButton.frame.maxX, app.buttons["Account"].frame.maxX)

        doneButton.tap()
        waitFor(app.staticTexts["Email the landlord"])
        XCTAssertTrue(doneButton.isSelected)
        XCTAssertFalse(app.buttons["Today"].isSelected)
        // No composer on Done: there's nowhere to add to.
        XCTAssertFalse(app.textViews["New todo"].exists || app.textFields["New todo"].exists)
    }

    func testSwipingPastListsReachesDone() {
        launch("lists")
        XCTAssertTrue(app.buttons["Lists"].wait(for: \.isSelected, toEqual: true, timeout: 5))
        app.swipeLeft()
        waitFor(app.staticTexts["Email the landlord"])
        XCTAssertTrue(doneButton.isSelected)
        app.swipeRight()
        XCTAssertTrue(app.buttons["Lists"].wait(for: \.isSelected, toEqual: true, timeout: 3))
        XCTAssertFalse(doneButton.isSelected)
    }

    func testTheAccountSheetLeavesDoneOut() {
        launch("today")
        waitFor(row("Review PR for the sync engine"))
        app.buttons["Account"].tap()
        waitFor(app.buttons["Settings"])
        XCTAssertTrue(app.buttons["Sign out"].exists)
        // The switcher's Done is behind the sheet; the sheet has none.
        XCTAssertEqual(app.buttons.matching(identifier: "Done").count, 1)
    }

    func testTitlesSitAtTheSameHeightWithOrWithoutThePill() {
        launch("overnight")
        let dismiss = app.buttons["Dismiss overnight note"]
        waitFor(dismiss)
        let withPill = title("Today").frame.minY
        dismiss.tap()
        XCTAssertTrue(dismiss.waitForNonExistence(timeout: 3))
        XCTAssertEqual(title("Today").frame.minY, withPill, accuracy: 1)

        doneButton.tap()
        waitFor(app.staticTexts["Email the landlord"])
        XCTAssertEqual(title("Done").frame.minY, withPill, accuracy: 1)
    }

    func testThePillGoesToThePageTheyMovedTo() {
        launch("overnight")
        let see = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "2 moved to")).firstMatch
        waitFor(see)
        see.tap()
        XCTAssertTrue(app.buttons["This week"].wait(for: \.isSelected, toEqual: true, timeout: 3))
    }
}

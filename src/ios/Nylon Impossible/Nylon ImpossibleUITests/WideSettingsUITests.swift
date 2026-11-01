//
//  WideSettingsUITests.swift
//  Nylon ImpossibleUITests
//
//  iPad's Settings sheet: Timezone opens its picker. The sheet once had no
//  navigation stack, so the row was drawn disabled and did nothing. iPad
//  only; skipped on iPhone, where the account sheet has always had one.
//

import XCTest

final class WideSettingsUITests: NylonUITestCase {
    func testTimezoneOpensThePicker() throws {
        try XCTSkipUnless(isPad, "The Settings sheet is iPad only")
        launch("settings")
        let timezone = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Automatic'")).firstMatch
        waitFor(timezone, timeout: 8)
        XCTAssertTrue(timezone.isEnabled)
        timezone.tap()
        waitFor(app.staticTexts["Where your midnight is"])
    }
}

//
//  NylonUITestCase.swift
//  Nylon ImpossibleUITests
//
//  UI tests drive the app through the DEBUG `-NylonScreen` routes, which
//  skip sign-in and draw in-memory sample data — no account, no network, no
//  real store. Run them with the "Nylon Impossible UI Tests" scheme; the
//  app's own scheme runs only the unit tests, so CI is unchanged.
//

import XCTest

class NylonUITestCase: XCTestCase {
    var app: XCUIApplication!

    var isPad: Bool { UIDevice.current.userInterfaceIdiom == .pad }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    override func tearDown() {
        app?.terminate()
        app = nil
        super.tearDown()
    }

    /// Launch into a screen route. `contentSize` is a UIKit content size
    /// category name (UICTContentSizeCategoryAccessibilityXXXL for AX5).
    @discardableResult
    func launch(
        _ route: String,
        dark: Bool = false,
        contentSize: String? = nil,
        extra: [String] = []
    ) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-NylonScreen", route, "-NylonDark", dark ? "YES" : "NO"] + extra
        if let contentSize {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", contentSize]
        }
        app.launch()
        self.app = app
        return app
    }

    /// A todo row: one element, labelled with the title.
    func row(_ title: String) -> XCUIElement {
        app.buttons[title].firstMatch
    }

    func waitFor(_ element: XCUIElement, timeout: TimeInterval = 5, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "\(element) never appeared", file: file, line: line)
    }
}

extension XCUIElement {
    /// The toast's text, wherever it's drawn.
    static func toast(_ text: String, in app: XCUIApplication) -> XCUIElement {
        app.staticTexts[text].firstMatch
    }
}

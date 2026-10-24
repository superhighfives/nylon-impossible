//
//  PullToRefreshUITests.swift
//  Nylon ImpossibleUITests
//
//  The iPhone list has no pull-to-refresh (#416): dragging it down moves it,
//  and nothing starts refreshing. Sync runs on foreground and from pushes.
//

import XCTest

final class PullToRefreshUITests: NylonUITestCase {
    func testPullingTheListDownDoesNotRefresh() throws {
        if isPad { throw XCTSkip("The iPad board keeps its pull-to-refresh") }
        launch("today", dark: true)
        let first = row("Call Mum about Sunday lunch")
        waitFor(first)

        // A slow pull, held well past where a refresh would trigger. The
        // marker is for fix-shots, which trims its recording to the gesture.
        print("FIX-SHOTS-GESTURE")
        fflush(stdout)
        let start = first.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        start.press(
            forDuration: 0.2,
            thenDragTo: start.withOffset(CGVector(dx: 0, dy: 320)),
            withVelocity: .slow,
            thenHoldForDuration: 1.5
        )

        XCTAssertFalse(app.activityIndicators.firstMatch.exists, "pulling the list down started a refresh")
    }
}

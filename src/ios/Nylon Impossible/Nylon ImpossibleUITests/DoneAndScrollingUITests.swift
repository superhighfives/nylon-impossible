//
//  DoneAndScrollingUITests.swift
//  Nylon ImpossibleUITests
//
//  Completing a todo: the checked row holds in place (no layout shift) and
//  then goes, with an Undo toast that brings it back. And scrolling 500
//  todos, measured for hitches.
//

import XCTest

final class DoneAndScrollingUITests: NylonUITestCase {
    /// The checkbox sits just inside the row's gutter (20pt on the phone,
    /// 24 on the board), level with the title's first line.
    private func tapCheckbox(of row: XCUIElement) {
        row.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0))
            .withOffset(CGVector(dx: (isPad ? 24 : 20) + 12, dy: 24))
            .tap()
    }

    func testDoneHoldsInPlaceThenLeavesWithUndo() {
        launch(isPad ? "board" : "today")
        let target = row("Call Mum about Sunday lunch")
        let next = row("Finish quarterly report")
        waitFor(target)
        let before = (target: target.frame, next: next.frame)

        tapCheckbox(of: target)

        // During the 400ms hold: checked, and nothing has moved. Read once,
        // straight away; a predicate expectation polls too slowly to land
        // inside the hold.
        XCTAssertTrue((target.value as? String)?.hasSuffix(", Done") == true || (target.value as? String) == "Done",
                      "not checked during the hold: \(String(describing: target.value))")
        XCTAssertEqual(target.frame, before.target, "the checked row moved during the hold")
        XCTAssertEqual(next.frame, before.next, "the row below moved during the hold")

        // Then it goes, and the toast offers Undo.
        let gone = NSPredicate(format: "exists == false")
        expectation(for: gone, evaluatedWith: target)
        waitForExpectations(timeout: 3)
        waitFor(app.buttons["Undo"])
        app.buttons["Undo"].tap()
        waitFor(row("Call Mum about Sunday lunch"))
    }

    func testFiveHundredTodosScroll() throws {
        #if targetEnvironment(simulator)
        // The simulator has no MetricMeasurementHelper, so the hitch metric
        // asserts inside XCTest. Run this one on a device.
        throw XCTSkip("Scroll hitch metrics need a device")
        #endif
        launch("perf")
        let first = row("Review the sync engine PR 1")
        waitFor(first, timeout: 10)
        let list = isPad ? app.scrollViews.firstMatch : app.collectionViews.firstMatch
        let options = XCTMeasureOptions()
        options.iterationCount = 3
        measure(metrics: [XCTOSSignpostMetric.scrollingAndDecelerationMetric], options: options) {
            list.swipeUp(velocity: .fast)
            stopMeasuring()
            list.swipeDown(velocity: .fast)
        }
    }

    func testDoneUnderLoad() {
        launch("perf")
        // The first row repeats, so done advances it and toasts its next
        // date: the hold, the commit and the toast, over 500 todos.
        let target = row("Review the sync engine PR 1")
        waitFor(target, timeout: 10)
        let options = XCTMeasureOptions()
        options.iterationCount = 1
        measure(metrics: [XCTClockMetric()], options: options) {
            tapCheckbox(of: target)
            // 400ms hold + commit; well inside 2s unless the main thread stalls.
            XCTAssertTrue(app.buttons["Undo"].waitForExistence(timeout: 2), "the done toast took over 2s")
        }
    }
}

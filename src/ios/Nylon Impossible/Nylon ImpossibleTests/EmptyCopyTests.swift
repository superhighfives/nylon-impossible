//
//  EmptyCopyTests.swift
//  Nylon ImpossibleTests
//
//  The empty states' words, the same as the web's and Gmail's (shared's
//  `EMPTY_COPY`, tested in api/test/unit/empty-copy.test.ts).
//

import Foundation
import Testing
@testable import Nylon_Impossible

@Suite("EmptyCopy")
struct EmptyCopyTests {
    @Test("Words each empty list as the web and Gmail do")
    func words() {
        #expect(EmptyCopy.today == "Nothing today.")
        #expect(EmptyCopy.thisWeek == "A clear week.")
        #expect(EmptyCopy.list == "Nothing here yet.")
    }

    @Test("Names the waiting list mid-sentence, with no period")
    func waiting() {
        #expect(EmptyCopy.waiting(4, in: "this week") == "4 waiting in this week")
        #expect(EmptyCopy.waiting(1, in: "someday") == "1 waiting in someday")
    }
}

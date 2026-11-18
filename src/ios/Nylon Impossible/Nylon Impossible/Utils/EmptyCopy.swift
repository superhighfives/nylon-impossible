//
//  EmptyCopy.swift
//  Nylon Impossible
//
//  The written empty states, worded the same on the iPhone's pages, the
//  menu bar, the widget, the web and the Gmail card (shared's `EMPTY_COPY`).
//  Built into the widget extension too.
//

import Foundation

enum EmptyCopy {
    static let today = "Nothing today."
    static let thisWeek = "A clear week."
    /// Someday and your lists.
    static let list = "Nothing here yet."

    /// Under an empty Today or This week: "4 waiting in this week". `listName`
    /// reads mid-sentence (`nameInSentence`).
    static func waiting(_ count: Int, in listName: String) -> String {
        "\(count) waiting in \(listName)"
    }
}

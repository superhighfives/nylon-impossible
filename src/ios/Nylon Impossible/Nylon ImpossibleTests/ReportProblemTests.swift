//
//  ReportProblemTests.swift
//  Nylon ImpossibleTests
//
//  Settings' Report a problem (#850): the iPhone's SettingsView and the Mac's
//  MacSettingsView both link to Config.reportProblemURL, GitHub's chooser for
//  the repo's issue forms, the same page as the web's link.
//

import Foundation
import Testing
@testable import Nylon_Impossible

@Suite("Report a problem")
struct ReportProblemTests {
    @Test("Links to the repo's issue-form chooser")
    func url() {
        #expect(Config.reportProblemURL.absoluteString == "https://github.com/superhighfives/nylon-impossible/issues/new/choose")
    }
}

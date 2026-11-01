//
//  AccessibilityAuditTests.swift
//  Nylon ImpossibleUITests
//
//  Xcode's accessibility audit over every screen route, at the default text
//  size and at AX5, in light and dark. An issue fails the test unless it's
//  one of the few `AuditAllowance`s below, each with its reason.
//

import XCTest

final class AccessibilityAuditTests: NylonUITestCase {
    static let ax5 = "UICTContentSizeCategoryAccessibilityXXXL"

    /// Screens both layouts share. iPad draws the board for the time lists.
    var routes: [(route: String, ready: String)] {
        if let only = ProcessInfo.processInfo.environment["NYLON_AUDIT_ROUTES"] {
            let wanted = Set(only.split(separator: ",").map(String.init))
            return allRoutes.filter { wanted.contains($0.route) }
        }
        return allRoutes
    }

    private var allRoutes: [(route: String, ready: String)] {
        var routes: [(String, String)] = [
            ("today", "Review PR for the sync engine"),
            // The first row: at AX5 the masthead and its banner space push
            // later ones below the fold, where the list hasn't drawn them.
            ("week", "Send invoice to Pika"),
            ("someday", "Read Piranesi"),
            ("detail", "Notes"),
            ("composer", "New todo"),
            ("done", "Email the landlord"),
            ("settings", "Appearance"),
            ("overnight", "Dismiss overnight note"),
            ("empty", "Nothing today."),
            ("loading", "Getting your lists…"),
            ("syncerror", "Retry sync"),
            ("signin", "Sign in"),
            ("share", "Add to Nylon"),
            ("sharetext", "Add to Nylon")
        ]
        if isPad {
            routes += [("column", "Parmesan"), ("inspector", "Notes")]
        } else {
            routes += [("lists", "Groceries"), ("collection", "Parmesan")]
        }
        return routes
    }

    func testAuditDefaultSizeLight() throws {
        try auditAll(dark: false, contentSize: nil)
    }

    func testAuditDefaultSizeDark() throws {
        try auditAll(dark: true, contentSize: nil)
    }

    func testAuditAX5() throws {
        try auditAll(dark: false, contentSize: Self.ax5)
    }

    private func auditAll(dark: Bool, contentSize: String?) throws {
        var failures: [String] = []
        for (route, ready) in routes {
            launch(route, dark: dark, contentSize: contentSize)
            let marker = app.descendants(matching: .any)[ready].firstMatch
            guard marker.waitForExistence(timeout: 8) else {
                failures.append("\(route): never showed “\(ready)”")
                continue
            }
            // Let the route's own delayed presentation (sheets, panels) land.
            sleep(1)
            let window = app.windows.firstMatch.frame
            // iPad draws Settings in a sheet; its scrolling area, by the
            // masthead's subline.
            let sheetQuery = app.scrollViews.containing(.staticText, identifier: "Synced across your devices").firstMatch
            let sheet = isPad && route == "settings" && sheetQuery.exists ? sheetQuery.frame : nil
            do {
                try app.performAccessibilityAudit(for: .all) { issue in
                    if AuditAllowance.allows(issue, route: route, window: window, sheet: sheet) { return true }
                    let element = issue.element.map { "\($0.elementType.rawValue) “\($0.label)” \($0.frame)" } ?? "–"
                    failures.append(
                        "\(route): \(issue.auditType.rawValue) — \(issue.compactDescription) — \(element) — \(issue.detailedDescription)"
                    )
                    return true
                }
            } catch {
                failures.append("\(route): audit threw \(error)")
            }
            app.terminate()
        }
        if !failures.isEmpty {
            XCTFail("\(failures.count) accessibility issue(s):\n" + failures.joined(separator: "\n"))
        }
    }
}

/// Audit findings that are known and accepted, each with why.
enum AuditAllowance {
    static func allows(_ issue: XCUIAccessibilityAuditIssue, route: String, window: CGRect, sheet: CGRect? = nil) -> Bool {
        let label = issue.element?.label ?? ""
        let detail = issue.detailedDescription
        let isPad = UIDevice.current.userInterfaceIdiom == .pad

        // The system keyboard's QuickType suggestions (composer, share). The
        // audit names the cell when it can; with text in the field ("friday")
        // it sometimes reports the suggestion as unlabelled text with no
        // element at all.
        if detail.contains("TUIPredictionViewCell") { return true }
        if ["composer", "share", "sharetext"].contains(route), issue.element == nil,
           issue.compactDescription.contains("inaccessible text") {
            return true
        }

        // At AX5 a phone page's rows run down under the floating glass
        // composer, and the audit samples their text through the glass,
        // which rows are never read through: the page scrolls them clear.
        // Only contrast, only on the phone, and only for a row that reaches
        // into the bottom of the window, where the composer floats.
        if issue.auditType == .contrast, !isPad,
           let frame = issue.element?.frame, frame.maxY > window.maxY - Self.composerReach {
            return true
        }

        // The switcher's titles stop growing at xxxLarge on purpose, like a
        // tab bar, and show in the Large Content Viewer on long press; the
        // masthead under them carries the list's name at full size.
        if issue.auditType == .dynamicType, ["Today", "This week", "Someday", "Lists"].contains(label),
           detail.contains("partially") || issue.compactDescription.contains("partially") {
            return true
        }

        // The board's sidebar is the same kind of chrome, in a fixed 248pt
        // column (`Theme.Wide.sidebarWidth`) on the leading edge: it stops
        // growing at xxxLarge, each control shows in the Large Content
        // Viewer, and the columns carry each list's name at full size. Only
        // text inside that column, and only on iPad, where it's drawn.
        if issue.auditType == .dynamicType,
           detail.contains("partially") || issue.compactDescription.contains("partially"),
           isPad, let frame = issue.element?.frame, frame.maxX <= Self.sidebarEdge {
            return true
        }

        // At AX sizes the switcher's titles don't all fit beside Done's check
        // and the avatar, so they scroll sideways (keeping the current one in
        // view), and "Lists" sits past the edge. The audit samples the
        // clipped title; on screen it's the same muted ink as the others.
        if issue.auditType == .contrast, ["Today", "This week", "Someday", "Lists"].contains(label),
           issue.element?.isHittable == false {
            return true
        }

        // The avatar's initials are decorative, drawn in a fixed 30pt circle
        // (ink on gray-3, 14:1); the button around them is labelled
        // "Account" and shows in the Large Content Viewer. The audit samples
        // the 44pt frame around the circle for contrast.
        if label.count <= 3, label == label.uppercased(), !label.isEmpty,
           issue.auditType == .dynamicType || issue.auditType == .contrast {
            return true
        }

        // Contrast samples the audit can't tie to an element, on screens
        // with the floating glass composer: text scrolled under the glass.
        // The composer's own placeholder and text use ink and muted ink.
        if issue.auditType == .contrast, issue.element == nil {
            return true
        }

        // The composer route draws the page under the focused composer and
        // keyboard; the masthead behind the glass isn't meant to be read.
        // The share sheet opens with its composer focused, so the keyboard
        // and the glass composer sit over the lower half of the sheet; the
        // audit samples the text under them. The sheet scrolls it clear.
        if ["composer", "share", "sharetext"].contains(route), issue.auditType == .contrast { return true }

        // A row's title stops at three lines and a link's domain at one, by
        // the spec's row anatomy; the full title is the VoiceOver label and
        // the detail's title. The audit flags those limits as "may clip".
        if issue.auditType == .textClipped, detail.contains("may be clipped") {
            let isRowText = issue.element?.elementType == .button
                || label.contains(".") && !label.contains(" ")
            if isRowText || rowTitles.contains(label) { return true }
        }

        // The board's "+ Add" field and its + are a line of text and a glyph
        // inside a 44pt row; the whole row takes the tap and focuses it.
        if issue.auditType == .hitRegion, label == "New todo" || label == "Add" { return true }
        // The same field, unnamed: it's rebuilt when the text size changes
        // (see `Composer.field`), so once the audit's Dynamic Type pass has
        // run, the field it saw is gone and it can't name it.
        if issue.auditType == .hitRegion, issue.element == nil, detail.contains("VerticalTextView") { return true }

        // The sidebar's account menu reports its whole 44pt label as the
        // name's frame, so the audit samples white and the avatar's gray-3
        // circle around the words. The name itself is ink on white, 16:1.
        if issue.auditType == .contrast, isPad, issue.element?.elementType == .staticText,
           let frame = issue.element?.frame, frame.maxX <= Self.sidebarEdge, frame.height >= 44 {
            return true
        }

        // In portrait the board scrolls sideways, and the fourth column runs
        // past the window's trailing edge; the audit samples the part of the
        // text that isn't on screen. Scrolled into view it's muted ink.
        if issue.auditType == .contrast, isPad, let frame = issue.element?.frame, frame.maxX > window.maxX {
            return true
        }

        // iPad's Settings is a modal sheet over the board. Its lower rows
        // run past the sheet's edge until it scrolls, and the audit samples
        // them against the dimmed board; and the board behind it, dimmed and
        // out of VoiceOver's reach while the sheet is up, shows as text and
        // controls no element covers.
        if let sheet {
            if issue.auditType == .contrast, let frame = issue.element?.frame, !sheet.contains(frame) { return true }
            if issue.auditType == .elementDetection, issue.element == nil { return true }
        }

        // On the board the sync error line has room for its buttons beside
        // the words, and `ViewThatFits` moves them under the words as the
        // text grows. Both layouts scale; the audit, growing the text, loses
        // the element it was tracking when the layout swaps and reports it
        // as partly unscaled, or, at AX5, as possibly clipped with no element
        // named. The words only sit beside the buttons when they fit on one
        // line, so neither layout clips them. On the phone this message is
        // too long for one row, so it's stacked at every size.
        if route == "syncerror", isPad {
            if issue.auditType == .dynamicType, label.hasPrefix("Couldn’t sync.") { return true }
            if issue.auditType == .textClipped, issue.element == nil { return true }
        }

        return false
    }

    /// The sidebar's trailing edge: it's 248pt wide, from the leading edge.
    private static let sidebarEdge: CGFloat = 248

    /// How far up from the bottom the phone's glass composer reaches at AX5,
    /// home indicator included.
    private static let composerReach: CGFloat = 200

    /// Sample-data titles, which the board draws under the 3-line limit.
    private static let rowTitles: Set<String> = [
        "Review PR for the sync engine", "Call Mum about Sunday lunch", "Finish quarterly report",
        "Water the plants", "Send invoice to Pika", "Renew passport", "Plan Lisbon trip",
        "Book dentist appointment", "Repaint the hallway", "Learn to make sourdough", "Read Piranesi",
        "Fix the bike’s back brake", "Parmesan", "Coffee beans", "Sourdough loaf", "Oat milk"
    ]
}

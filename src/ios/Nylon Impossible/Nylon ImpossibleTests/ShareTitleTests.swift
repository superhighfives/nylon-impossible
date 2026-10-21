//
//  ShareTitleTests.swift
//  Nylon ImpossibleTests
//
//  Tests for TaskCreationService.titleFromURL(_:), which generates a
//  short "Check domain.com" title from a full URL when sharing via the
//  Share Extension. Placing the helper on TaskCreationService (rather than
//  ShareSheetView) keeps it in the main target where it is testable and
//  reusable.
//

import Testing
import Foundation
@testable import Nylon_Impossible

@Suite("TaskCreationService.titleFromURL")
struct ShareTitleTests {

    // MARK: - Basic domain extraction

    @Test("produces 'Check domain.com' for a simple URL")
    func simpleDomain() {
        let title = TaskCreationService.titleFromURL("https://example.com")
        #expect(title == "Check example.com")
    }

    @Test("strips www prefix from domain")
    func stripsWWW() {
        let title = TaskCreationService.titleFromURL("https://www.google.com/search?q=test")
        #expect(title == "Check google.com")
    }

    @Test("preserves non-www subdomains")
    func preservesSubdomain() {
        let title = TaskCreationService.titleFromURL("https://blog.example.com/post/123")
        #expect(title == "Check blog.example.com")
    }

    @Test("ignores query string and path when building title")
    func ignoresQueryAndPath() {
        let title = TaskCreationService.titleFromURL("https://example.com/path?foo=bar&baz=qux")
        #expect(title == "Check example.com")
    }

    // MARK: - Long Google Search URL (the original bug case)

    @Test("produces short title for a very long Google Search URL")
    func longGoogleSearchURL() {
        // This is representative of the URL in the bug report —
        // over 1 000 characters when prefixed with "Check: "
        let longURL = "https://www.google.com/search?client=safari&q=gore+verbinski+movies"
            + "&hl=en-gb&sxsrf=ANbLn76rl8EWt3s-sRZlDv--tCpL-SRfQ:1773632961047"
            + "&si=AL3DRZHJoCibURVB0Hlwa-VLMfrQPpzwFnTejTFWQtOOMkUhYejHgfrv"
            + String(repeating: "x", count: 600) // pad to guarantee >500 chars

        let title = TaskCreationService.titleFromURL(longURL)

        // Title should be short — domain only, no raw URL content
        #expect(title == "Check google.com")
        #expect(title.count <= 500)
    }

    @Test("title is always well within the 500-char sync limit")
    func titleFitsWithinSyncLimit() {
        let urls = [
            "https://www.google.com/search?" + String(repeating: "a=b&", count: 200),
            "https://subdomain.very-long-domain-name-that-exists.co.uk/page",
            "https://example.com/" + String(repeating: "path/", count: 100),
        ]

        for url in urls {
            let title = TaskCreationService.titleFromURL(url)
            #expect(title.count <= 500, "Title for \(url.prefix(60))… exceeded 500 chars")
        }
    }

    // MARK: - http (non-https)

    @Test("handles http URLs")
    func httpURL() {
        let title = TaskCreationService.titleFromURL("http://example.com/article")
        #expect(title == "Check example.com")
    }

    // MARK: - Edge / invalid inputs

    @Test("falls back to raw string when URL cannot be parsed")
    func invalidURL() {
        let input = "not a url at all"
        let title = TaskCreationService.titleFromURL(input)
        // Fallback: return the input unchanged so the user still sees something
        #expect(title == input)
    }

    @Test("falls back to raw string for empty input")
    func emptyString() {
        let title = TaskCreationService.titleFromURL("")
        #expect(title == "")
    }
}

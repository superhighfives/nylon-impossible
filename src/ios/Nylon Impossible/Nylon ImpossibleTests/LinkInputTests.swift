//
//  LinkInputTests.swift
//  Nylon ImpossibleTests
//
//  The "Paste a link" field's rule, the same table as `normalizeLink`'s in
//  src/api/test/unit/link.test.ts, so the app and the API agree.
//

import Testing
@testable import Nylon_Impossible

@Suite("Paste a link")
struct LinkInputTests {
    @Test("links, with https:// added when there's no scheme", arguments: [
        ("visitlisboa.com", "https://visitlisboa.com/"),
        ("  visitlisboa.com/en  ", "https://visitlisboa.com/en"),
        ("http://example.com", "http://example.com/"),
        ("HTTPS://Example.COM/Path", "https://example.com/Path"),
        ("a.b", "https://a.b/"),
        ("localhost", "https://localhost/"),
        ("localhost:3000/x", "https://localhost:3000/x"),
        ("example.com:8080", "https://example.com:8080/")
    ])
    func accepts(raw: String, href: String) {
        #expect(LinkInput.normalize(raw) == href)
    }

    @Test("not links", arguments: [
        "", "   ", "hello", "http://x", "example.com.", ".example.com", "not a link",
        "javascript:alert(1)", "ftp://example.com", "mailto:hi@example.com",
        "https://user:pass@example.com", "https://google.com@evil.example"
    ])
    func rejects(raw: String) {
        #expect(LinkInput.normalize(raw) == nil)
    }
}

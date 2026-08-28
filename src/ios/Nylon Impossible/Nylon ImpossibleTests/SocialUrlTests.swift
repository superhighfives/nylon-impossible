//
//  SocialUrlTests.swift
//  Nylon ImpossibleTests
//
//  Tests for `socialUrlInfo(for:)` and `parseSocialAuthor(_:)`, the two
//  helpers behind the social preview cards.
//
//  These deliberately mirror the web suite in `src/web/src/lib/__tests__/
//  social-urls.test.ts`, case for case. The two platforms each carry their
//  own copy of this logic — there's no shared runtime between Swift and
//  TypeScript — so the parallel suites are what stop them drifting apart
//  again. Change one side and the matching case here should move with it.
//

import Testing
import Foundation
@testable import Nylon_Impossible

@Suite("socialUrlInfo(for:)")
struct SocialUrlInfoTests {

    // MARK: - Twitter / X

    @Test("detects a tweet on both twitter.com and x.com")
    func detectsTweet() {
        for url in [
            "https://x.com/bcherny/status/1234567890",
            "https://twitter.com/bcherny/status/1234567890",
            "https://www.x.com/bcherny/status/1234567890"
        ] {
            let info = socialUrlInfo(for: url)
            #expect(info?.platform == .twitter)
            #expect(info?.isPost == true)
        }
    }

    @Test("detects the canonical /i tweet forms")
    func detectsCanonicalTweetForms() {
        #expect(socialUrlInfo(for: "https://x.com/i/status/123")?.isPost == true)
        #expect(socialUrlInfo(for: "https://x.com/i/web/status/123")?.isPost == true)
    }

    @Test("treats a bare profile as not a post")
    func profileIsNotAPost() {
        let info = socialUrlInfo(for: "https://x.com/bcherny")
        #expect(info?.platform == .twitter)
        #expect(info?.isPost == false)
        #expect(info?.hostname == "x.com")
    }

    // MARK: - Instagram

    @Test("detects Instagram posts and reels but not profiles")
    func detectsInstagramPosts() {
        #expect(socialUrlInfo(for: "https://instagram.com/p/abc123")?.isPost == true)
        #expect(socialUrlInfo(for: "https://instagram.com/reel/abc123")?.isPost == true)
        #expect(socialUrlInfo(for: "https://instagram.com/someone")?.isPost == false)
    }

    // MARK: - YouTube

    @Test("detects YouTube videos across watch, short-link, and shorts forms")
    func detectsYouTubeVideos() {
        #expect(socialUrlInfo(for: "https://www.youtube.com/watch?v=abc123")?.isPost == true)
        #expect(socialUrlInfo(for: "https://youtu.be/abc123")?.isPost == true)
        #expect(socialUrlInfo(for: "https://youtube.com/shorts/abc123")?.isPost == true)
        #expect(socialUrlInfo(for: "https://www.youtube.com/@someone")?.isPost == false)
    }

    // MARK: - Host matching

    @Test("is case-insensitive on the host")
    func caseInsensitiveHost() {
        #expect(socialUrlInfo(for: "https://X.COM/bcherny")?.platform == .twitter)
    }

    @Test("returns nil for unrelated and malformed URLs")
    func nilForUnrelatedURLs() {
        #expect(socialUrlInfo(for: "https://example.com/x.com/status/1") == nil)
        #expect(socialUrlInfo(for: "not a url") == nil)
    }
}

@Suite("parseSocialAuthor(_:)")
struct ParseSocialAuthorTests {

    @Test("splits the 'Name (@handle) on X' og:title shape")
    func splitsAuthorTitle() {
        let author = parseSocialAuthor("Boris Cherny (@bcherny) on X")
        #expect(author?.name == "Boris Cherny")
        #expect(author?.handle == "@bcherny")
    }

    @Test("handles the profile shape with no trailing ' on X'")
    func splitsProfileTitle() {
        let author = parseSocialAuthor("Boris Cherny (@bcherny)")
        #expect(author?.name == "Boris Cherny")
        #expect(author?.handle == "@bcherny")
    }

    @Test("keeps the whole title as the name when there's no handle")
    func keepsTitleWithoutHandle() {
        let author = parseSocialAuthor("Some Video Title")
        #expect(author?.name == "Some Video Title")
        #expect(author?.handle == nil)
    }

    // The card's old inline parse skipped this trim, so a padded og:title
    // rendered with the whitespace still attached — web trimmed, iOS didn't.
    @Test("trims surrounding whitespace off the name")
    func trimsName() {
        #expect(parseSocialAuthor("  Boris Cherny  (@bcherny) on X")?.name == "Boris Cherny")
    }

    @Test("returns nil for a missing or empty title")
    func nilForMissingTitle() {
        #expect(parseSocialAuthor(nil) == nil)
        #expect(parseSocialAuthor("") == nil)
    }
}

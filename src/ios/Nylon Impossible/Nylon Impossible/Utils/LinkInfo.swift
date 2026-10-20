//
//  LinkInfo.swift
//  Nylon Impossible
//
//  What kind of link a URL is — a social post or a webmail thread — so a link
//  card can name it properly. Mirrored in the web `social-urls.ts`.
//

import Foundation

// MARK: - Social platform detection

enum SocialPlatform {
    case twitter
    case instagram
    case youtube
}

struct SocialUrlInfo {
    let platform: SocialPlatform
    /// Whether this is a specific post/tweet vs a profile/channel page
    let isPost: Bool
    /// Host of the parsed URL, reused to avoid double-parsing in the views
    let hostname: String
}

/// Author details pulled out of a social og:title.
struct SocialAuthor {
    /// Display name, with the "(@handle)" suffix stripped when there was one.
    let name: String
    /// "@handle", or nil when the title wasn't in the author shape.
    let handle: String?
}

/// Split the "Name (@handle) on X" og:title shape the social platforms use into
/// its parts. Titles that don't match keep their whole text as the name, so
/// callers can always fall back to `name`.
///
/// Mirrored in `parseSocialAuthor` in the web `social-urls.ts` — keep the two in
/// step so a tweet reads the same on both clients.
func parseSocialAuthor(_ title: String?) -> SocialAuthor? {
    guard let title, !title.isEmpty else { return nil }
    guard let match = try? NSRegularExpression(pattern: #"^(.+?)\s+\(@([^)]+)\)"#)
        .firstMatch(in: title, range: NSRange(title.startIndex..., in: title)),
        let nameRange = Range(match.range(at: 1), in: title),
        let handleRange = Range(match.range(at: 2), in: title)
    else {
        return SocialAuthor(name: title, handle: nil)
    }
    return SocialAuthor(
        name: String(title[nameRange]).trimmingCharacters(in: .whitespacesAndNewlines),
        handle: "@\(title[handleRange])"
    )
}

private let twitterHosts: Set<String> = ["twitter.com", "x.com", "www.twitter.com", "www.x.com"]
private let instagramHosts: Set<String> = ["instagram.com", "www.instagram.com"]
private let youtubeHosts: Set<String> = ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"]

func socialUrlInfo(for urlString: String) -> SocialUrlInfo? {
    guard let parsed = URL(string: urlString), let host = parsed.host?.lowercased() else {
        return nil
    }
    let path = parsed.path

    if twitterHosts.contains(host) {
        // Standard tweet: /user/status/id
        // Canonical /i forms: /i/status/id and /i/web/status/id
        let isTweet =
            path.range(of: #"^/[^/]+/status/\d+"#, options: .regularExpression) != nil ||
            path.range(of: #"^/i/(web/)?status/\d+"#, options: .regularExpression) != nil
        return SocialUrlInfo(platform: .twitter, isPost: isTweet, hostname: host)
    }

    if instagramHosts.contains(host) {
        let isPost = path.hasPrefix("/p/") || path.hasPrefix("/reel/")
        return SocialUrlInfo(platform: .instagram, isPost: isPost, hostname: host)
    }

    if youtubeHosts.contains(host) {
        let isVideo = (host == "youtu.be" && path.count > 1)
            || URLComponents(string: urlString)?.queryItems?.contains(where: { $0.name == "v" }) == true
            || path.hasPrefix("/shorts/")
        return SocialUrlInfo(platform: .youtube, isPost: isVideo, hostname: host)
    }

    return nil
}

// MARK: - Email link detection

enum EmailProvider {
    case gmail
}

struct EmailUrlInfo {
    let provider: EmailProvider
}

private let gmailHosts: Set<String> = ["mail.google.com"]

/// Detect whether a URL points at a webmail thread (currently Gmail) so we can
/// render it as an email — the subject as the label — rather than a bare host.
/// Populated by the Gmail add-on, which attaches the thread permalink with the
/// subject as its title.
func emailUrlInfo(for urlString: String) -> EmailUrlInfo? {
    guard let host = URL(string: urlString)?.host?.lowercased() else {
        return nil
    }
    if gmailHosts.contains(host) {
        return EmailUrlInfo(provider: .gmail)
    }
    return nil
}

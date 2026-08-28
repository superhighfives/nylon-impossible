//
//  SocialPreviewCard.swift
//  Nylon Impossible
//

import SwiftUI

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

// MARK: - Platform badge views

/// The platform mark shown in the corner of a social card.
///
/// These are the real brand glyphs, drawn from the same vector paths the web
/// card inlines as SVG (`SocialPreviewCard.tsx`) — SF Symbols has no brand
/// logos, and the nearest stand-ins didn't read as the platforms: `xmark` is a
/// close button, not the X logo, and `camera` isn't Instagram.
struct PlatformBadgeView: View {
    let platform: SocialPlatform

    /// 14pt, matching the web badge's `w-3.5 h-3.5`.
    private static let size: CGFloat = 14

    private var assetName: String {
        switch platform {
        case .twitter: return "SocialLogoX"
        case .instagram: return "SocialLogoInstagram"
        case .youtube: return "SocialLogoYouTube"
        }
    }

    /// Same split as the web card: the marks sit in the text colour, except
    /// YouTube, which keeps its red.
    private var tint: Color {
        switch platform {
        case .twitter, .instagram: return .appDefault
        case .youtube: return .appDanger
        }
    }

    var body: some View {
        Image(assetName)
            .renderingMode(.template)
            .resizable()
            .aspectRatio(contentMode: .fit)
            .frame(width: Self.size, height: Self.size)
            .foregroundStyle(tint)
    }
}

// MARK: - Social Preview Card (full, for edit sheet)

struct SocialPreviewCard: View {
    let url: APITodoUrl

    private var social: SocialUrlInfo? { socialUrlInfo(for: url.url) }

    /// Height cap for an attached post image, matching the web card's `max-h-40`.
    private static let postImageHeight: CGFloat = 160

    var body: some View {
        if let social, let destination = URL(string: url.url) {
            let author = parseSocialAuthor(url.title)
            let displayName = author?.name ?? url.siteName ?? social.hostname
            let handle = author?.handle
            // An empty description is no description — web treats "" as absent,
            // and an empty Text would otherwise leave a gap under the header.
            let bodyText: String? = url.description?.isEmpty == false ? url.description : nil
            let imageURL = url.image.flatMap { URL(string: $0) }

            Link(destination: destination) {
                VStack(alignment: .leading, spacing: 0) {
                    // Header row
                    HStack(spacing: 10) {
                        // Profile picture for profiles, skip for posts
                        if let imageURL, !social.isPost {
                            AsyncImage(url: imageURL) { phase in
                                switch phase {
                                case .success(let img):
                                    img.resizable()
                                        .aspectRatio(contentMode: .fill)
                                        .frame(width: 32, height: 32)
                                        .clipShape(Circle())
                                default:
                                    Circle()
                                        .fill(Color.appTint)
                                        .frame(width: 32, height: 32)
                                }
                            }
                        }

                        VStack(alignment: .leading, spacing: 1) {
                            Text(displayName)
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .foregroundStyle(.primary)
                                .lineLimit(1)

                            if let handle {
                                Text(handle)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                            }
                        }

                        Spacer()

                        PlatformBadgeView(platform: social.platform)
                    }
                    .padding(.horizontal, 12)
                    .padding(.top, 12)
                    .padding(.bottom, bodyText != nil || (imageURL != nil && social.isPost) ? 8 : 12)

                    // Body text (tweet / bio / description)
                    if let bodyText {
                        Text(bodyText)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(3)
                            .padding(.horizontal, 12)
                            .padding(.bottom, imageURL != nil && social.isPost ? 8 : 12)
                    }

                    // Post image (for tweet cards / YouTube thumbnails)
                    if let imageURL, social.isPost {
                        AsyncImage(url: imageURL) { phase in
                            if case .success(let img) = phase {
                                img.resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: Self.postImageHeight)
                                    .clipped()
                            }
                        }
                        .clipShape(
                            UnevenRoundedRectangle(
                                bottomLeadingRadius: 12,
                                bottomTrailingRadius: 12
                            )
                        )
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color(.secondarySystemGroupedBackground))
                        .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .strokeBorder(Color(.separator).opacity(0.5), lineWidth: 0.5)
                )
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Social Preview Card Compact (for main list row)

struct SocialPreviewCardCompact: View {
    let url: APITodoUrl

    private var social: SocialUrlInfo? { socialUrlInfo(for: url.url) }

    private func displayTitle(_ social: SocialUrlInfo) -> String {
        parseSocialAuthor(url.title)?.name ?? url.siteName ?? social.hostname
    }

    var body: some View {
        if let social, let destination = URL(string: url.url) {
            Link(destination: destination) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        PlatformBadgeView(platform: social.platform)

                        // An author name truncates at the end, as it does on
                        // web — middle truncation belongs to the raw-URL chip.
                        Text(displayTitle(social))
                            .font(.system(size: 12))
                            .foregroundStyle(Color.appSubtle)
                            .lineLimit(1)
                    }

                    // The tweet/post text, which the list chip used to drop
                    // even though the web chip has always shown it. Capped at
                    // two lines so one long post can't outgrow the list.
                    if let description = url.description, !description.isEmpty {
                        Text(description)
                            .font(.system(size: 11))
                            .foregroundStyle(Color.appSubtle)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color.appLine.opacity(0.3))
                )
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Preview

private func previewSocialUrl(
    _ id: String,
    url: String,
    description: String? = nil,
    image: String? = nil
) -> APITodoUrl {
    APITodoUrl(
        id: id,
        todoId: "todo1",
        researchId: nil,
        url: url,
        title: "Boris Cherny (@bcherny) on X",
        description: description,
        siteName: "X",
        favicon: nil,
        image: image,
        position: "a\(id)",
        fetchStatus: .fetched,
        fetchedAt: Date(),
        createdAt: Date(),
        updatedAt: Date()
    )
}

#Preview("Social Cards") {
    ScrollView {
        VStack(alignment: .leading, spacing: 16) {
            Group {
                Text("Full cards").font(.headline)

                SocialPreviewCard(url: previewSocialUrl(
                    "1",
                    url: "https://x.com/bcherny",
                    description: "Software engineer. Working on Claude Code at @Anthropic.",
                    image: "https://pbs.twimg.com/profile_images/example/photo.jpg"
                ))

                SocialPreviewCard(url: previewSocialUrl(
                    "2",
                    url: "https://x.com/user/status/123456789",
                    description: "Just shipped something cool. Check it out!"
                ))
            }

            Group {
                Divider()
                Text("Platform marks").font(.headline)

                // The brand glyphs, shared with the web card.
                HStack(spacing: 12) {
                    PlatformBadgeView(platform: .twitter)
                    PlatformBadgeView(platform: .instagram)
                    PlatformBadgeView(platform: .youtube)
                }
            }

            Group {
                Divider()
                Text("Compact chips").font(.headline)

                SocialPreviewCardCompact(url: previewSocialUrl(
                    "3",
                    url: "https://x.com/bcherny"
                ))

                SocialPreviewCardCompact(url: previewSocialUrl(
                    "4",
                    url: "https://x.com/user/status/123456789",
                    description: "A tweet long enough to run past a single line, so the chip shows the two-line cap the web chip uses and truncates the rest."
                ))
            }
        }
        .padding()
    }
}

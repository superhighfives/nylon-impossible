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
        return SocialUrlInfo(platform: .twitter, isPost: isTweet)
    }

    if instagramHosts.contains(host) {
        let isPost = path.hasPrefix("/p/") || path.hasPrefix("/reel/")
        return SocialUrlInfo(platform: .instagram, isPost: isPost)
    }

    if youtubeHosts.contains(host) {
        let isVideo = (host == "youtu.be" && path.count > 1)
            || URLComponents(string: urlString)?.queryItems?.contains(where: { $0.name == "v" }) == true
            || path.hasPrefix("/shorts/")
        return SocialUrlInfo(platform: .youtube, isPost: isVideo)
    }

    return nil
}

// MARK: - Platform badge views

struct PlatformBadgeView: View {
    let platform: SocialPlatform

    var body: some View {
        Group {
            switch platform {
            case .twitter:
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.primary)
            case .instagram:
                Image(systemName: "camera")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: "#f09433"), Color(hex: "#e6683c"),
                                     Color(hex: "#dc2743"), Color(hex: "#cc2366"), Color(hex: "#bc1888")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            case .youtube:
                Image(systemName: "play.rectangle.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(.red)
            }
        }
    }
}

// MARK: - Social Preview Card (full, for edit sheet)

struct SocialPreviewCard: View {
    let url: APITodoUrl

    private var social: SocialUrlInfo? { socialUrlInfo(for: url.url) }

    /// Parse "Name (@handle) on X" → (name, "@handle")
    private var parsedAuthor: (name: String, handle: String?)? {
        guard let title = url.title else { return nil }
        if let match = try? NSRegularExpression(pattern: #"^(.+?)\s+\(@([^)]+)\)"#)
            .firstMatch(in: title, range: NSRange(title.startIndex..., in: title)) {
            let nameRange = Range(match.range(at: 1), in: title)
            let handleRange = Range(match.range(at: 2), in: title)
            let name = nameRange.map { String(title[$0]) }
            let handle = handleRange.map { "@\(title[$0])" }
            return (name ?? title, handle)
        }
        return (title, nil)
    }

    var body: some View {
        if let social, let destination = URL(string: url.url) {
            let author = parsedAuthor
            let displayName = author?.name ?? url.siteName ?? URL(string: url.url)?.host ?? url.url
            let handle = author?.handle
            let bodyText = url.description
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
                                        .fill(Color.secondary.opacity(0.2))
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
                                    .frame(height: 140)
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

    private var displayTitle: String {
        guard let title = url.title else {
            return url.siteName ?? URL(string: url.url)?.host ?? url.url
        }
        // Strip " on X" / " on Instagram" suffixes and extract name
        if let match = try? NSRegularExpression(pattern: #"^(.+?)\s+\(@[^)]+\)"#)
            .firstMatch(in: title, range: NSRange(title.startIndex..., in: title)),
           let nameRange = Range(match.range(at: 1), in: title) {
            return String(title[nameRange])
        }
        return title
    }

    var body: some View {
        if let social, let destination = URL(string: url.url) {
            Link(destination: destination) {
                HStack(spacing: 6) {
                    PlatformBadgeView(platform: social.platform)
                        .frame(width: 14, height: 14)

                    Text(displayTitle)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.appSubtle)
                        .lineLimit(1)
                        .truncationMode(.middle)
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

#Preview("Social Cards") {
    ScrollView {
        VStack(alignment: .leading, spacing: 16) {
            Text("Full cards").font(.headline)

            SocialPreviewCard(url: APITodoUrl(
                id: "1",
                todoId: "todo1",
                researchId: nil,
                url: "https://x.com/bcherny",
                title: "Boris Cherny (@bcherny) on X",
                description: "Software engineer. Working on Claude Code at @Anthropic.",
                siteName: "X",
                favicon: nil,
                image: "https://pbs.twimg.com/profile_images/example/photo.jpg",
                position: "a0",
                fetchStatus: .fetched,
                fetchedAt: Date(),
                createdAt: Date(),
                updatedAt: Date()
            ))

            SocialPreviewCard(url: APITodoUrl(
                id: "2",
                todoId: "todo1",
                researchId: nil,
                url: "https://x.com/user/status/123456789",
                title: "Boris Cherny (@bcherny) on X",
                description: "Just shipped something cool. Check it out!",
                siteName: "X",
                favicon: nil,
                image: nil,
                position: "a1",
                fetchStatus: .fetched,
                fetchedAt: Date(),
                createdAt: Date(),
                updatedAt: Date()
            ))

            Divider()
            Text("Compact chips").font(.headline)

            SocialPreviewCardCompact(url: APITodoUrl(
                id: "3",
                todoId: "todo1",
                researchId: nil,
                url: "https://x.com/bcherny",
                title: "Boris Cherny (@bcherny) on X",
                description: nil,
                siteName: "X",
                favicon: nil,
                image: nil,
                position: "a2",
                fetchStatus: .fetched,
                fetchedAt: Date(),
                createdAt: Date(),
                updatedAt: Date()
            ))
        }
        .padding()
    }
}

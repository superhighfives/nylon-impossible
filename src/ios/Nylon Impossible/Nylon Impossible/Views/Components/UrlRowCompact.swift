//
//  UrlRowCompact.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/13/26.
//

import SwiftUI

/// Compact URL card for the main todo list view
/// Shows: favicon + title (when fetched) or hostname (when pending/failed)
struct UrlRowCompact: View {
    let url: APITodoUrl
    
    /// Pending URLs untouched for this long are treated as failed (worker likely restarted)
    private static let stalePendingThreshold: TimeInterval = 30

    /// Check if a pending URL is stale (fetch likely lost due to worker restart).
    /// Measured from `updatedAt`, not `createdAt`: re-processing an old link
    /// flips it back to pending, and that fresh spinner shouldn't read as stale
    /// just because the row was created weeks ago.
    private var isStale: Bool {
        url.fetchStatus == .pending &&
        Date().timeIntervalSince(url.updatedAt) > Self.stalePendingThreshold
    }
    
    private var isPending: Bool {
        url.fetchStatus == .pending && !isStale
    }
    
    private var isFailed: Bool {
        url.fetchStatus == .failed || isStale
    }
    
    private var hostname: String {
        URL(string: url.url)?.host ?? url.url
    }
    
    private var displayTitle: String {
        // Preview removed — show just the raw URL.
        if !url.showsPreview {
            return url.url
        }
        // Show hostname for pending/failed, full title when fetched
        if isPending || isFailed {
            return hostname
        }
        if let title = url.title, !title.isEmpty {
            return title
        }
        if let siteName = url.siteName, !siteName.isEmpty {
            return siteName
        }
        return hostname
    }
    
    private var storedFaviconURL: URL? {
        if let favicon = url.favicon, let faviconUrl = URL(string: favicon) {
            return faviconUrl
        }
        return nil
    }

    private var googleFaviconURL: URL? {
        if let host = URL(string: url.url)?.host,
           let encoded = host.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            return URL(string: "https://www.google.com/s2/favicons?domain=\(encoded)&sz=32")
        }
        return nil
    }

    var body: some View {
        // Attached email links (e.g. a Gmail thread) render as the subject
        if url.showsPreview, emailUrlInfo(for: url.url) != nil {
            EmailRowCompact(url: url)
        } else if url.showsPreview, !isPending && !isFailed, socialUrlInfo(for: url.url) != nil {
            // Use rich social chip for fetched social URLs (unless the preview is off)
            SocialPreviewCardCompact(url: url)
        } else {
            Link(destination: URL(string: url.url)!) {
                HStack(spacing: 6) {
                    // Icon: spinner while fetching, warning when the fetch didn't
                    // land, favicon otherwise.
                    Group {
                        if isPending {
                            ProgressView()
                                .scaleEffect(0.6)
                        } else if isFailed {
                            Image(systemName: "exclamationmark.triangle")
                                .font(.system(size: 11))
                                .foregroundStyle(Color.appDanger)
                        } else {
                            FaviconImage(primaryURL: storedFaviconURL, fallbackURL: googleFaviconURL)
                        }
                    }
                    .frame(width: 14, height: 14)

                    Text(displayTitle)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.appSubtle)
                        .lineLimit(1)
                        .truncationMode(.middle)

                    if isPending {
                        Text("Fetching...")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                    }

                    // A fetch that never landed used to look the same as a page
                    // with no title. Say so, so "Process links" in the edit
                    // sheet reads as the obvious next move.
                    if isFailed {
                        Text("Couldn't fetch")
                            .font(.system(size: 10))
                            .foregroundStyle(Color.appDanger)
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

#Preview {
    VStack(alignment: .leading, spacing: 8) {
        // Simulated pending URL
        UrlRowCompact(url: APITodoUrl(
            id: "1",
            todoId: "todo1",
            researchId: nil,
            url: "https://example.com",
            title: nil,
            description: nil,
            siteName: nil,
            favicon: nil,
            image: nil,
            position: "a0",
            fetchStatus: .pending,
            fetchedAt: nil,
            createdAt: Date(),
            updatedAt: Date()
        ))

        // Simulated fetched URL
        UrlRowCompact(url: APITodoUrl(
            id: "2",
            todoId: "todo1",
            researchId: nil,
            url: "https://news.ycombinator.com",
            title: "Hacker News",
            description: nil,
            siteName: "Hacker News",
            favicon: "https://news.ycombinator.com/favicon.ico",
            image: nil,
            position: "a1",
            fetchStatus: .fetched,
            fetchedAt: Date(),
            createdAt: Date(),
            updatedAt: Date()
        ))
    }
    .padding()
}

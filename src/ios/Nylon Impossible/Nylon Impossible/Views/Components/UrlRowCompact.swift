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
    
    /// Pending URLs older than this threshold are treated as failed (worker likely restarted)
    private static let stalePendingThreshold: TimeInterval = 30
    
    /// Check if a pending URL is stale (fetch likely lost due to worker restart)
    private var isStale: Bool {
        url.fetchStatus == .pending &&
        Date().timeIntervalSince(url.createdAt) > Self.stalePendingThreshold
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
    
    private var faviconURL: URL? {
        if let favicon = url.favicon, let faviconUrl = URL(string: favicon) {
            return faviconUrl
        }
        if let host = URL(string: url.url)?.host {
            return URL(string: "https://www.google.com/s2/favicons?domain=\(host)&sz=32")
        }
        return nil
    }
    
    var body: some View {
        Link(destination: URL(string: url.url)!) {
            HStack(spacing: 6) {
                // Icon: spinner for pending, favicon otherwise (no error icon for compact)
                Group {
                    if isPending {
                        ProgressView()
                            .scaleEffect(0.6)
                    } else {
                        AsyncImage(url: faviconURL) { image in
                            image
                                .resizable()
                                .aspectRatio(contentMode: .fit)
                        } placeholder: {
                            Image(systemName: "link")
                                .foregroundStyle(.secondary)
                                .font(.system(size: 10))
                        }
                    }
                }
                .frame(width: 14, height: 14)
                
                Text(displayTitle)
                    .font(.system(size: 12))
                    .foregroundStyle(Color.appSubtle)
                    .lineLimit(1)
                
                if isPending {
                    Text("Fetching...")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
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

#Preview {
    VStack(alignment: .leading, spacing: 8) {
        // Simulated pending URL
        UrlRowCompact(url: APITodoUrl(
            id: "1",
            todoId: "todo1",
            url: "https://example.com",
            title: nil,
            description: nil,
            siteName: nil,
            favicon: nil,
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
            url: "https://news.ycombinator.com",
            title: "Hacker News",
            description: nil,
            siteName: "Hacker News",
            favicon: "https://news.ycombinator.com/favicon.ico",
            position: "a1",
            fetchStatus: .fetched,
            fetchedAt: Date(),
            createdAt: Date(),
            updatedAt: Date()
        ))
    }
    .padding()
}

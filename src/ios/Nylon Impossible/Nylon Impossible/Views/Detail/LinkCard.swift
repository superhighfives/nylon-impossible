//
//  LinkCard.swift
//  Nylon Impossible
//
//  A link in the detail sheet: favicon tile, title and domain, and a menu
//  with Copy URL, Show as URL, Retry and Remove. Titles fetch on their own; Retry
//  re-runs the same processing for a fetch that didn't land.
//  In the board's fourth column it's a row instead of a card: the tile in
//  the checkbox gutter, the board's 15pt title, and no border.
//

import SwiftUI
#if os(macOS)
import AppKit
#else
import UIKit
#endif

struct LinkCard: View {
    let url: APITodoUrl
    /// A board row rather than a bordered card.
    var isRow = false
    let onToggleShowPreview: () -> Void
    let onRetry: () -> Void
    let onRemove: () -> Void

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// A pending fetch untouched this long has almost certainly been lost.
    private static let stalePending: TimeInterval = 30

    private var isFailed: Bool {
        url.fetchStatus == .failed
            || (url.fetchStatus == .pending && Date().timeIntervalSince(url.updatedAt) > Self.stalePending)
    }

    private var isPending: Bool { url.fetchStatus == .pending && !isFailed }

    private var domain: String { LinkLabel.domain(url.url) ?? url.url }

    private var title: String {
        if !url.showsPreview { return url.url }
        if emailUrlInfo(for: url.url) != nil {
            return url.title.flatMap { $0.isEmpty ? nil : $0 } ?? "Email"
        }
        if isPending || isFailed { return domain }
        if socialUrlInfo(for: url.url) != nil, let author = parseSocialAuthor(url.title) {
            return author.handle.map { "\(author.name) \($0)" } ?? author.name
        }
        if let title = url.title, !title.isEmpty { return title }
        if let site = url.siteName, !site.isEmpty { return site }
        return domain
    }

    private var subtitle: String {
        if isPending { return "Fetching title…" }
        if isFailed { return "\(domain) · Couldn’t fetch" }
        if emailUrlInfo(for: url.url) != nil { return url.siteName ?? "Gmail" }
        return domain
    }

    private var faviconURL: URL? { url.favicon.flatMap(URL.init(string:)) }

    private var fallbackFaviconURL: URL? {
        guard let host = URL(string: url.url)?.host,
              let encoded = host.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return nil }
        return URL(string: "https://www.google.com/s2/favicons?domain=\(encoded)&sz=64")
    }

    @ViewBuilder
    var body: some View {
        if isRow {
            HStack(spacing: Theme.Space.s3) {
                content
                menu.padding(.trailing, -Theme.Space.s3)
            }
            .frame(minHeight: Theme.Space.rowMinHeight)
            .padding(.vertical, Theme.Space.s1)
        } else {
            HStack(spacing: Theme.Space.s3) {
                content
                menu
            }
            .padding(.leading, Theme.Space.s3)
            .padding(.vertical, Theme.Space.s2)
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous)
                    .strokeBorder(Theme.Colors.hairline, lineWidth: 1)
            )
        }
    }

    @ViewBuilder
    private var content: some View {
        let label = HStack(spacing: Theme.Space.s3) {
            tile
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .textStyle(isRow ? Theme.Fonts.Role.rowTitleWide : Theme.Fonts.Role.control)
                    .fontWeight(.medium)
                    .foregroundStyle(Theme.Colors.ink)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
                    .truncationMode(url.showsPreview ? .tail : .middle)
                Text(subtitle)
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(isFailed ? Theme.Colors.overdue : Theme.Colors.inkMuted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())

        if let destination = URL(string: url.url) {
            Link(destination: destination) { label }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the link")
        } else {
            label
        }
    }

    private var tile: some View {
        ZStack {
            RoundedRectangle(cornerRadius: isRow ? 6 : 8, style: .continuous)
                .fill(Theme.Colors.fill)
            if isPending {
                ProgressView().controlSize(.small)
            } else if isFailed {
                Image(systemName: Theme.Icon.error)
                    .foregroundStyle(Theme.Colors.overdue)
            } else {
                Text(domain.prefix(1).uppercased())
                    .font(.system(size: isRow ? 11 : 13, weight: .bold))
                    .foregroundStyle(Theme.Colors.inkMuted)
                FaviconImage(primaryURL: faviconURL, fallbackURL: fallbackFaviconURL)
                    .frame(width: isRow ? 14 : 18, height: isRow ? 14 : 18)
            }
        }
        // As a row, the tile takes the checkbox's place in the gutter.
        .frame(width: isRow ? Theme.Phone.checkbox : 32, height: isRow ? Theme.Phone.checkbox : 32)
        .accessibilityHidden(true)
    }

    private func copyURL() {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url.url, forType: .string)
        #else
        UIPasteboard.general.string = url.url
        #endif
    }

    private var menu: some View {
        Menu {
            Button(action: copyURL) {
                Label("Copy URL", systemImage: "doc.on.doc")
            }
            Button(action: onToggleShowPreview) {
                Label(
                    url.showsPreview ? "Show as URL" : "Show preview",
                    systemImage: url.showsPreview ? Theme.Icon.link : "text.below.photo"
                )
            }
            Button(action: onRetry) {
                Label("Retry", systemImage: Theme.Icon.retry)
            }
            Button(role: .destructive, action: onRemove) {
                Label("Remove", systemImage: Theme.Icon.delete)
            }
        } label: {
            Image(systemName: Theme.Icon.more)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Theme.Colors.inkMuted)
                .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Link options")
    }
}

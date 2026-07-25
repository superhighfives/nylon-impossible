//
//  EmailPreviewCard.swift
//  Nylon Impossible
//

import SwiftUI

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

// MARK: - Display helpers

/// Message subject, carried in on `title` by the add-on.
private func emailSubject(_ url: APITodoUrl) -> String {
    if let title = url.title, !title.isEmpty { return title }
    return "Email"
}

/// Provider label (e.g. "Gmail"), carried in on `siteName`.
private func emailProvider(_ url: APITodoUrl) -> String {
    if let siteName = url.siteName, !siteName.isEmpty { return siteName }
    return "Gmail"
}

/// Best icon for the email: the stored favicon, else the provider favicon via
/// Google's service (which resolves to Gmail's icon for mail.google.com).
private func emailFaviconURL(_ url: APITodoUrl) -> URL? {
    if let favicon = url.favicon, let faviconUrl = URL(string: favicon) {
        return faviconUrl
    }
    if let host = URL(string: url.url)?.host,
       let encoded = host.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
        return URL(string: "https://www.google.com/s2/favicons?domain=\(encoded)&sz=32")
    }
    return nil
}

// MARK: - Cards

/// Full email link card for the edit sheet: icon + subject, provider as the
/// sub-label instead of the raw permalink. Opens the thread on tap.
struct EmailRow: View {
    let url: APITodoUrl

    var body: some View {
        Link(destination: URL(string: url.url)!) {
            HStack(spacing: 12) {
                FaviconImage(primaryURL: emailFaviconURL(url), fallbackURL: nil)
                    .frame(width: 20, height: 20)

                VStack(alignment: .leading, spacing: 2) {
                    Text(emailSubject(url))
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(.primary)
                        .lineLimit(1)

                    Text(emailProvider(url))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }

                Spacer()

                Image(systemName: "arrow.up.right")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// Compact email link card for the main todo list view.
struct EmailRowCompact: View {
    let url: APITodoUrl

    var body: some View {
        Link(destination: URL(string: url.url)!) {
            HStack(spacing: 6) {
                FaviconImage(primaryURL: emailFaviconURL(url), fallbackURL: nil)
                    .frame(width: 14, height: 14)

                Text(emailSubject(url))
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

//
//  ResearchSection.swift
//  Nylon Impossible
//
//  Displays the AI research section inside a todo's detail sheet.
//  Mirrors the behaviour of ResearchSection.tsx on the web.
//

import SwiftUI

// MARK: - Thresholds

private let showRetryThreshold: TimeInterval = 30     // 30 seconds
private let staleThreshold: TimeInterval = 300        // 5 minutes

// MARK: - ResearchSection

struct ResearchSection: View {
    let research: APIResearch
    let researchUrls: [APITodoUrl]
    var onReresearch: () async -> Void
    var onCancelResearch: () async -> Void

    @State private var isReresearching = false
    @State private var isCancelling = false
    @State private var now = Date()

    var body: some View {
        Section {
            switch research.status {
            case "pending":
                pendingView
            case "failed":
                failedView
            case "completed":
                completedView
            default:
                EmptyView()
            }
        } header: {
            HStack(spacing: 4) {
                Image(systemName: "sparkles")
                    .font(.caption)
                Text("Research")
            }
        }
        // Only tick the clock while research is actually pending; cancel automatically
        // when status changes so no timer runs for completed/failed research.
        .task(id: research.status) {
            guard research.status == "pending" else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                now = Date()
            }
        }
    }

    // MARK: - Pending

    private var pendingAge: TimeInterval {
        now.timeIntervalSince(research.createdAt)
    }

    @ViewBuilder
    private var pendingView: some View {
        if pendingAge >= staleThreshold {
            // Timed out
            HStack {
                Text("Research timed out.")
                    .font(.subheadline)
                    .foregroundStyle(.red)
                Spacer()
                retryButton
            }
        } else {
            // Still running
            HStack {
                ProgressView()
                    .scaleEffect(0.8)
                Text("Researching...")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                if pendingAge >= showRetryThreshold {
                    HStack(spacing: 8) {
                        cancelButton
                        retryButton
                    }
                }
            }
        }
    }

    // MARK: - Failed

    private var failedView: some View {
        HStack {
            Text("Research failed.")
                .font(.subheadline)
                .foregroundStyle(.red)
            Spacer()
            retryButton
        }
    }

    // MARK: - Completed

    @ViewBuilder
    private var completedView: some View {
        if let summary = research.summary {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Spacer()
                    Button {
                        Task { await triggerReresearch() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.caption)
                            .rotationEffect(.degrees(isReresearching ? 360 : 0))
                            .animation(isReresearching ? .linear(duration: 0.8).repeatForever(autoreverses: false) : .default, value: isReresearching)
                    }
                    .disabled(isReresearching)
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Refresh research")
                }
                .padding(.bottom, -8)

                FormattedSummaryView(summary: summary, urls: researchUrls)

                if !researchUrls.isEmpty {
                    VStack(spacing: 8) {
                        ForEach(Array(researchUrls.enumerated()), id: \.element.id) { index, url in
                            ResearchSourceCard(url: url, citationNumber: index + 1)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Action Buttons

    private var retryButton: some View {
        Button {
            Task { await triggerReresearch() }
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "arrow.clockwise")
                    .font(.caption)
                Text("Try again")
                    .font(.caption)
            }
        }
        .disabled(isReresearching || isCancelling)
        .buttonStyle(.bordered)
        .controlSize(.mini)
    }

    private var cancelButton: some View {
        Button {
            Task { await triggerCancel() }
        } label: {
            Text("Cancel")
                .font(.caption)
        }
        .disabled(isCancelling || isReresearching)
        .buttonStyle(.bordered)
        .controlSize(.mini)
    }

    // MARK: - Actions

    private func triggerReresearch() async {
        isReresearching = true
        defer { isReresearching = false }
        await onReresearch()
    }

    private func triggerCancel() async {
        isCancelling = true
        defer { isCancelling = false }
        await onCancelResearch()
    }
}

// MARK: - FormattedSummaryView

/// Renders research summary text with tappable [N] citation links using AttributedString.
private struct FormattedSummaryView: View {
    let summary: String
    let urls: [APITodoUrl]

    var body: some View {
        Text(attributedSummary)
            .font(.subheadline)
            .environment(\.openURL, OpenURLAction { _ in .handled })
    }

    private var attributedSummary: AttributedString {
        var result = AttributedString()
        let pattern = /\[(\d+)\]/
        var remaining = summary[...]

        for match in summary.matches(of: pattern) {
            // Plain text before citation
            let before = String(remaining[remaining.startIndex..<match.range.lowerBound])
            if !before.isEmpty {
                result += AttributedString(before)
            }

            let num = Int(match.output.1) ?? 0
            if num > 0, num <= urls.count, let dest = URL(string: urls[num - 1].url) {
                var citation = AttributedString("[\(num)]")
                citation.link = dest
                citation.foregroundColor = .init(Color.yellow)
                result += citation
            } else {
                result += AttributedString("[\(num)]")
            }

            remaining = summary[match.range.upperBound...]
        }

        let tail = String(remaining)
        if !tail.isEmpty {
            result += AttributedString(tail)
        }

        return result
    }
}

// MARK: - ResearchSourceCard

struct ResearchSourceCard: View {
    let url: APITodoUrl
    let citationNumber: Int

    private var isPending: Bool { url.fetchStatus == .pending }
    private var isFailed: Bool { url.fetchStatus == .failed }
    private var destinationURL: URL? { URL(string: url.url) }

    private var displayTitle: String {
        if isPending || isFailed {
            return destinationURL?.host ?? url.url
        }
        if let t = url.title, !t.isEmpty { return t }
        if let s = url.siteName, !s.isEmpty { return s }
        return destinationURL?.host ?? url.url
    }

    private var storedFaviconURL: URL? {
        url.favicon.flatMap { URL(string: $0) }
    }

    private var googleFaviconURL: URL? {
        guard let host = destinationURL?.host,
              let encoded = host.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)
        else { return nil }
        return URL(string: "https://www.google.com/s2/favicons?domain=\(encoded)&sz=32")
    }

    var body: some View {
        let cardContent = HStack(spacing: 10) {
            // Citation badge
            Text("[\(citationNumber)]")
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(Color.yellow)
                .padding(.horizontal, 5)
                .padding(.vertical, 2)
                .background(Color.yellow.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 4))

            // Icon
            Group {
                if isPending {
                    ProgressView()
                        .scaleEffect(0.6)
                } else if isFailed {
                    Image(systemName: "exclamationmark.circle")
                        .foregroundStyle(.red)
                } else {
                    FaviconImage(primaryURL: storedFaviconURL, fallbackURL: googleFaviconURL)
                }
            }
            .frame(width: 16, height: 16)

            VStack(alignment: .leading, spacing: 2) {
                Text(displayTitle)
                    .font(.caption)
                    .fontWeight(.medium)
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text(url.url)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()

            Image(systemName: "arrow.up.right")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(10)
        .background(Color.appElevated)
        .clipShape(RoundedRectangle(cornerRadius: 10))

        if let dest = destinationURL {
            Link(destination: dest) { cardContent }
                .buttonStyle(.plain)
        } else {
            cardContent
        }
    }
}

// MARK: - Preview

#Preview {
    let research = APIResearch(
        id: "r1",
        status: "completed",
        researchType: "general",
        summary: "Dogs age roughly 7 times faster than humans in their early years [1]. The ratio varies by breed and size, with larger dogs aging faster [2]. A 1-year-old dog is approximately equivalent to a 15-year-old human [1].",
        researchedAt: Date(),
        createdAt: Date()
    )
    let url1 = APITodoUrl(
        id: "u1", todoId: "todo-1", researchId: "r1",
        url: "https://www.akc.org/expert-advice/health/how-do-dogs-age/",
        title: "How Do Dogs Age? - American Kennel Club",
        description: nil, siteName: "AKC", favicon: nil,
        position: "a0", fetchStatus: .fetched, fetchedAt: Date(),
        createdAt: Date(), updatedAt: Date()
    )
    let url2 = APITodoUrl(
        id: "u2", todoId: "todo-1", researchId: "r1",
        url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7093975/",
        title: "A DNA methylation atlas of normal human cell types",
        description: nil, siteName: "PubMed", favicon: nil,
        position: "a1", fetchStatus: .fetched, fetchedAt: Date(),
        createdAt: Date(), updatedAt: Date()
    )

    Form {
        ResearchSection(
            research: research,
            researchUrls: [url1, url2],
            onReresearch: {},
            onCancelResearch: {}
        )
    }
}

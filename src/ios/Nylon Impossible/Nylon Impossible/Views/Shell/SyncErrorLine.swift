//
//  SyncErrorLine.swift
//  Nylon Impossible
//

import SwiftUI

/// One quiet line under the switcher (over the board, on iPad) when a sync
/// genuinely fails — transient blips and being offline never reach `.error`;
/// see `SyncService.sync()`. Retry tries again; × puts the line away until
/// the next failure. Nothing is lost either way: changes stay on the device
/// and go up with the next sync that works.
struct SyncErrorLine: View {
    let message: String
    var gutter: CGFloat = Theme.Phone.gutter
    let onRetry: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: Theme.Space.s2) {
                icon
                text.lineLimit(2)
                Spacer(minLength: Theme.Space.s2)
                buttons
            }
            // Large text: the words get the width, the buttons go under them.
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline, spacing: Theme.Space.s2) {
                    icon
                    text
                }
                .padding(.top, Theme.Space.s2)
                HStack(spacing: Theme.Space.s2) { buttons }
            }
        }
        .textStyle(Theme.Fonts.Role.meta)
        .padding(.leading, gutter)
        .padding(.trailing, gutter - Theme.Space.s3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.Colors.destructiveFill)
        .overlay(alignment: .bottom) { Hairline() }
        .accessibilityElement(children: .contain)
    }

    private var icon: some View {
        Image(systemName: Theme.Icon.error)
            .foregroundStyle(Theme.Colors.overdue)
            .accessibilityHidden(true)
    }

    private var text: some View {
        Text("Couldn’t sync. \(message)")
            .foregroundStyle(Theme.Colors.ink)
            .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private var buttons: some View {
        Button("Retry", action: onRetry)
            .fontWeight(.semibold)
            .foregroundStyle(Theme.Colors.ink)
            .padding(.horizontal, Theme.Space.s1)
            .frame(minWidth: Theme.Space.rowMinHeight, minHeight: Theme.Space.rowMinHeight)
            .contentShape(Rectangle())
            .buttonStyle(.plain)
            .accessibilityLabel("Retry sync")
        Button(action: onDismiss) {
            Image(systemName: Theme.Icon.close)
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Theme.Colors.inkMuted)
                .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Dismiss sync error")
    }
}

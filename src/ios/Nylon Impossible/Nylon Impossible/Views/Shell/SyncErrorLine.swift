//
//  SyncErrorLine.swift
//  Nylon Impossible
//

import SwiftUI

/// One quiet line under the switcher when a sync genuinely fails (transient
/// blips never reach `.error` — see `SyncService.sync()`), with Retry.
struct SyncErrorLine: View {
    let message: String
    let onRetry: () -> Void

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Theme.Space.s2) {
            Image(systemName: Theme.Icon.error)
                .foregroundStyle(Theme.Colors.overdue)
                .accessibilityHidden(true)
            Text("Couldn’t sync. \(message)")
                .foregroundStyle(Theme.Colors.inkMuted)
                .lineLimit(2)
            Spacer(minLength: Theme.Space.s2)
            Button("Retry", action: onRetry)
                .fontWeight(.semibold)
                .foregroundStyle(Theme.Colors.ink)
                .frame(minHeight: Theme.Space.rowMinHeight)
                .buttonStyle(.plain)
                .accessibilityLabel("Retry sync")
        }
        .textStyle(Theme.Fonts.Role.meta)
        .padding(.horizontal, Theme.Phone.gutter)
        .background(Theme.Colors.destructiveFill.opacity(0.5))
    }
}

//
//  SyncErrorBanner.swift
//  Nylon Impossible
//

import SwiftUI

/// Floating banner shown under the header when a sync genuinely fails
/// (transient connectivity blips never reach the error state — see
/// `SyncService.sync()`). Carries the full error detail and a retry
/// action inline, replacing the old avatar-menu popover.
struct SyncErrorBanner: View {
    let message: String
    var onRetry: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.appDanger)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Couldn't sync")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color.appDefault)
                    Text(message)
                        .font(.system(size: 12))
                        .foregroundStyle(Color.appStrong)
                        .lineLimit(3)
                }
            }

            Spacer(minLength: 8)

            Button(action: onRetry) {
                Text("Retry")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Color.appDefault)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(Color.appTint, in: Capsule())
                    // Keep the compact capsule visual but give the tap a
                    // full-size (≥44pt) target.
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Retry sync")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .glassEffect(.regular, in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(Color.appLine.opacity(0.5), lineWidth: 0.5)
        )
        .accessibilityElement(children: .combine)
    }
}

#Preview {
    ZStack {
        GradientBackground()
        VStack(spacing: 16) {
            SyncErrorBanner(message: "Server error (500): Unknown [URL: https://api.nylonimpossible.com/todos/sync]") {}
            SyncErrorBanner(message: "Not authorized. Please sign in again.") {}
        }
        .padding(16)
    }
}

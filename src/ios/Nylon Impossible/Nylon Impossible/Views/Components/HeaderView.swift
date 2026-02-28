//
//  HeaderView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI

struct HeaderView: View {
    var onSignOut: (() -> Void)?
    var syncState: SyncState = .idle
    var todoCount: Int = 0

    var body: some View {
        VStack(spacing: 12) {
            // Top bar with sync status and sign out
            HStack {
                // Sync status indicator
                syncStatusView

                Spacer()

                if let onSignOut {
                    Button {
                        onSignOut()
                    } label: {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: 18))
                            .foregroundStyle(Color.kumoStrong)
                    }
                }
            }
            .frame(height: 24)

            // Title and count
            VStack(alignment: .leading, spacing: 4) {
                Text("My Tasks")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(Color.kumoDefault)

                Text("\(todoCount) \(todoCount == 1 ? "task" : "tasks")")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.kumoSubtle)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.top, 16)
    }

    @ViewBuilder
    private var syncStatusView: some View {
        switch syncState {
        case .idle:
            EmptyView()
        case .syncing:
            HStack(spacing: 6) {
                ProgressView()
                    .scaleEffect(0.7)
                Text("Syncing...")
                    .font(.caption)
                    .foregroundStyle(Color.kumoSubtle)
            }
        case .success(let date):
            HStack(spacing: 4) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(Color.kumoSuccess)
                Text("Synced \(date.formatted(.relative(presentation: .named)))")
                    .font(.caption)
                    .foregroundStyle(Color.kumoSubtle)
            }
        case .error(let message):
            HStack(spacing: 4) {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(Color.kumoDanger)
                Text(message)
                    .font(.caption)
                    .foregroundStyle(Color.kumoDanger)
                    .lineLimit(1)
            }
        }
    }
}

#Preview {
    ZStack {
        GradientBackground()
        VStack(spacing: 40) {
            HeaderView(onSignOut: {}, syncState: .idle, todoCount: 5)
            HeaderView(onSignOut: {}, syncState: .syncing, todoCount: 3)
            HeaderView(onSignOut: {}, syncState: .success(Date()), todoCount: 1)
            HeaderView(onSignOut: {}, syncState: .error("Network error"), todoCount: 0)
        }
    }
}

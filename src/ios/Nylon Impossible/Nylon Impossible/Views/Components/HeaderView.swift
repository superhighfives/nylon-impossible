//
//  HeaderView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI

struct HeaderView: View {
    @Environment(UserPreferencesService.self) private var preferencesService
    
    var onSignOut: (() -> Void)?
    var syncState: SyncState = .idle
    var todoCount: Int = 0

    @State private var showErrorPopover = false
    @State private var showSettings = false

    var body: some View {
        VStack(spacing: 12) {
            // Top bar with sync status and sign out
            HStack {
                // Sync status indicator
                syncStatusView

                Spacer()

                Button {
                    showSettings = true
                } label: {
                    Image(systemName: "gear")
                        .font(.system(size: 18))
                        .foregroundStyle(Color.appStrong)
                        .frame(width: 36, height: 36)
                        .glassEffect(.regular, in: .circle)
                }
                .accessibilityLabel("Settings")

                if let onSignOut {
                    Button {
                        onSignOut()
                    } label: {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: 18))
                            .foregroundStyle(Color.appStrong)
                            .frame(width: 36, height: 36)
                            .glassEffect(.regular, in: .circle)
                    }
                }
            }
            .frame(height: 36)
            .sheet(isPresented: $showSettings) {
                SettingsView()
                    .environment(preferencesService)
            }

            // Title and count
            VStack(alignment: .leading, spacing: 4) {
                Text("My Tasks")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(Color.appDefault)

                Text("\(todoCount) \(todoCount == 1 ? "task" : "tasks")")
                    .font(.system(size: 13))
                    .foregroundStyle(Color.appSubtle)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            #if DEBUG
            DebugBannerView()
            #endif
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
                    .foregroundStyle(Color.appSubtle)
            }
        case .success(let date):
            HStack(spacing: 4) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(Color.appSuccess)
                Text("Synced \(date.formatted(.relative(presentation: .named)))")
                    .font(.caption)
                    .foregroundStyle(Color.appSubtle)
            }
        case .error(let message):
            Button {
                showErrorPopover.toggle()
            } label: {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(Color.appDanger)
            }
            .popover(isPresented: $showErrorPopover) {
                ScrollView {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(Color.appDanger)
                        .padding()
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(minWidth: 280, minHeight: 100, maxHeight: 300)
                .presentationCompactAdaptation(.popover)
            }
        }
    }
}

#Preview {
    @Previewable @State var preferencesService = UserPreferencesService(
        apiService: APIService(authService: AuthService())
    )
    
    ZStack {
        GradientBackground()
        VStack(spacing: 40) {
            HeaderView(onSignOut: {}, syncState: .idle, todoCount: 5)
            HeaderView(onSignOut: {}, syncState: .syncing, todoCount: 3)
            HeaderView(onSignOut: {}, syncState: .success(Date()), todoCount: 1)
            HeaderView(onSignOut: {}, syncState: .error("Network error"), todoCount: 0)
        }
    }
    .environment(preferencesService)
}

//
//  HeaderView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI

struct HeaderView: View {
    @Environment(UserPreferencesService.self) private var preferencesService
    @Environment(SyncService.self) private var syncService
    @Environment(AuthService.self) private var authService

    var onSignOut: (() -> Void)?
    var syncState: SyncState = .idle

    @State private var showSettings = false

    var body: some View {
        // Mirrors the web header: a compact centered pill with the logo and the
        // user avatar overlapping. Settings, sign out, and sync state live
        // inside the avatar menu (the web app tucks these behind the Clerk
        // UserButton) rather than as separate top-bar controls.
        VStack(spacing: 12) {
            // Spacing accounts for the avatar's 44pt tap target (6pt of
            // transparent inset around its 32pt visual) so the logo/avatar
            // still visually overlap by ~8pt like the web header.
            HStack(spacing: -14) {
                logo
                avatarMenu
            }
            .padding(4)
            .glassEffect(.regular, in: .capsule)
            .overlay(
                Capsule()
                    .strokeBorder(Color.appLine.opacity(0.5), lineWidth: 0.5)
            )

            #if DEBUG
            DebugBannerView()
            #endif
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 16)
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environment(preferencesService)
                .environment(syncService)
                .environment(authService)
        }
    }

    private var logo: some View {
        Image("Logo")
            .resizable()
            .scaledToFit()
            .frame(width: 20, height: 20)
            // The mark always sits on the fixed yellow appBrand circle, so it must
            // stay in its dark form. Without this, dark mode resolves the inverted
            // (light) Logo variant and renders a near-invisible white mark on yellow.
            .environment(\.colorScheme, .light)
            .padding(6)
            .frame(width: 32, height: 32)
            .background(Color.appBrand)
            .clipShape(Circle())
            .overlay(Circle().stroke(Color.appBase, lineWidth: 2))
            .accessibilityLabel("Nylon Impossible")
    }

    private var avatarMenu: some View {
        Menu {
            syncStatusMenuContent

            Button {
                showSettings = true
            } label: {
                Label("Settings", systemImage: "gear")
            }

            if let onSignOut {
                Button(role: .destructive) {
                    onSignOut()
                } label: {
                    Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        } label: {
            // Keep the 32pt visual but give the menu a ≥44pt hit target.
            avatar
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .accessibilityLabel("Account")
    }

    private var avatar: some View {
        AsyncImage(url: authService.userImageURL) { image in
            image
                .resizable()
                .scaledToFill()
        } placeholder: {
            Image(systemName: "person.crop.circle.fill")
                .resizable()
                .scaledToFit()
                .foregroundStyle(Color.appSubtle)
        }
        .frame(width: 32, height: 32)
        .clipShape(Circle())
        .overlay(Circle().stroke(Color.appBase, lineWidth: 2))
    }

    @ViewBuilder
    private var syncStatusMenuContent: some View {
        switch syncState {
        case .idle:
            EmptyView()
        case .syncing:
            Text("Syncing…")
        case .success(let date):
            Text("Synced \(date.formatted(.relative(presentation: .named)))")
        case .error:
            // The failure itself (message + retry) lives in the main view as
            // SyncErrorBanner; the menu just acknowledges the state.
            Label("Sync failed", systemImage: "exclamationmark.circle")
        }
    }
}

#Preview {
    @Previewable @State var preferencesService = UserPreferencesService(
        apiService: APIService(authService: AuthService())
    )
    @Previewable @State var syncService = SyncService(authService: AuthService())
    @Previewable @State var authService = AuthService()

    ZStack {
        GradientBackground()
        VStack(spacing: 40) {
            HeaderView(onSignOut: {}, syncState: .idle)
            HeaderView(onSignOut: {}, syncState: .syncing)
            HeaderView(onSignOut: {}, syncState: .success(Date()))
            HeaderView(onSignOut: {}, syncState: .error("Network error"))
        }
    }
    .environment(preferencesService)
    .environment(syncService)
    .environment(authService)
}

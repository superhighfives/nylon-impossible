//
//  AccountSheet.swift
//  Nylon Impossible
//
//  What the avatar opens: who you are, then Settings and Sign out — and, for
//  an admin, Send feedback. Settings pushes inside the sheet, which grows to
//  full height for it. Done is its own page, the check beside the avatar.
//

import SwiftUI

enum AccountRoute: Hashable {
    case settings
}

struct AccountSheet: View {
    let name: String
    let initials: String
    let imageURL: URL?
    let actions: TodoActions
    let onSignOut: () -> Void
    /// Opens the feedback sheet; nil hides the row (not an admin).
    var onFeedback: (() -> Void)?

    @Binding var path: [AccountRoute]
    @Binding var detent: PresentationDetent
    @Environment(UserPreferencesService.self) private var preferences

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    identity
                    row("Settings") { path.append(.settings) }
                    if let onFeedback {
                        row("Send feedback", showsChevron: false, action: onFeedback)
                    }
                    row("Sign out", showsChevron: false, action: onSignOut)
                }
                .padding(.horizontal, Theme.Space.s4)
                .padding(.top, Theme.Space.s4)
            }
            .scrollBounceBehavior(.basedOnSize)
            .background(Theme.Colors.canvas)
            .hidesNavigationBar()
            .navigationDestination(for: AccountRoute.self) { route in
                switch route {
                case .settings:
                    SettingsView()
                }
            }
        }
        .overlay(alignment: .bottom) {
            ToastView(toasts: actions.toasts)
                .padding(.bottom, Theme.Space.s4)
        }
        .toastMagicTap(actions.toasts)
        .onChange(of: path) { _, newPath in
            withAnimation(Theme.Motion.easeOutStrong(Theme.Motion.base)) {
                detent = newPath.isEmpty ? .medium : .large
            }
        }
    }

    private var identity: some View {
        HStack(spacing: Theme.Space.s3) {
            AvatarView(imageURL: imageURL, initials: initials, size: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text(name)
                    .textStyle(Theme.Fonts.Role.body)
                    .fontWeight(.semibold)
                    .foregroundStyle(Theme.Colors.ink)
                Text(preferences.timezoneAuto ? "Timezone set from this device" : "Timezone: \(TimezoneLabel.text(preferences.timezone))")
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
            }
        }
        .padding(.horizontal, Theme.Space.s3)
        .padding(.bottom, Theme.Space.s3)
        .accessibilityElement(children: .combine)
    }

    private func row(
        _ title: String,
        showsChevron: Bool = true,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack {
                Text(title)
                    .textStyle(Theme.Fonts.Role.body)
                    .fontWeight(.medium)
                    .foregroundStyle(Theme.Colors.ink)
                Spacer()
                if showsChevron { Chevron() }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
            .background(Theme.Colors.fill, in: RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

enum TimezoneLabel {
    /// "America/New_York" → "America/New York".
    static func text(_ zone: String) -> String {
        zone.replacingOccurrences(of: "_", with: " ")
    }
}

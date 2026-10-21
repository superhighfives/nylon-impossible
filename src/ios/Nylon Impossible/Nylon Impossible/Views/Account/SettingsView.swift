//
//  SettingsView.swift
//  Nylon Impossible
//
//  Settings, on the same pieces as the rest of the app: section labels,
//  hairlines, chips and plain rows — no stock `Form`. Appearance, timezone
//  (automatic from the device, or picked by hand), links, and account
//  deletion.
//

import SwiftData
import SwiftUI

struct SettingsView: View {
    @Environment(UserPreferencesService.self) private var preferences
    @Environment(SyncService.self) private var syncService
    @Environment(AuthService.self) private var authService
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @State private var confirmsDelete = false
    @State private var isDeleting = false
    @State private var deleteMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Masthead(title: "Settings", subline: "Synced across your devices")
                section("Appearance") { appearance }
                section("Timezone", footer: "Today moves to This Week, and This Week to Someday, at your local midnight. A todo gets at least a full day in Today.") {
                    timezone
                }
                section("About") { about }
                #if DEBUG
                section("Advanced", footer: "Build and connection details, shown in debug builds only.") { advanced }
                #endif
                section("Account", footer: "Permanently deletes your account and all of your todos. This can’t be undone.") {
                    deleteAccount
                }
            }
            .padding(.bottom, Theme.Space.s16)
        }
        .background(Theme.Colors.canvas)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.Colors.canvas, for: .navigationBar)
        .alert("Delete your account?", isPresented: $confirmsDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { Task { await performDelete() } }
        } message: {
            Text("This permanently deletes your account and all of your todos. This can’t be undone.")
        }
    }

    private func section<Content: View>(
        _ title: String,
        footer: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: Theme.Space.s2) {
            SectionLabel(text: title)
            content()
            if let footer {
                Text(footer)
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, Theme.Space.s1)
            }
            Hairline().padding(.top, Theme.Space.s4)
        }
        .padding(.horizontal, Theme.Phone.gutter)
        .padding(.top, 22)
    }

    // MARK: - Appearance

    private var appearance: some View {
        // Wraps at large text sizes instead of truncating each chip.
        FlowLayout(spacing: Theme.Space.s2, lineSpacing: 0) {
            themeChip("System", value: "system", icon: Theme.Icon.themeSystem)
            themeChip("Light", value: "light", icon: Theme.Icon.themeLight)
            themeChip("Dark", value: "dark", icon: Theme.Icon.themeDark)
        }
    }

    private func themeChip(_ title: String, value: String, icon: String) -> some View {
        ChipButton(text: title, systemImage: icon, isOn: preferences.theme == value, strong: true) {
            Task { await preferences.setTheme(value) }
        }
    }

    // MARK: - Timezone

    private var timezone: some View {
        NavigationLink {
            TimezonePickerView()
        } label: {
            PlainRow(title: preferences.timezoneAuto ? "Automatic" : "Set by hand") {
                Text(TimezoneLabel.text(preferences.timezoneAuto ? UserPreferencesService.deviceTimeZone : preferences.timezone))
                    .textStyle(Theme.Fonts.Role.body)
                    .foregroundStyle(Theme.Colors.inkMuted)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
                Chevron()
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - About

    private var about: some View {
        VStack(spacing: 0) {
            linkRow("Privacy Policy", "https://nylonimpossible.com/privacy")
            linkRow("Terms of Service", "https://nylonimpossible.com/terms")
        }
    }

    private func linkRow(_ title: String, _ address: String) -> some View {
        Link(destination: URL(string: address)!) {
            PlainRow(title: title) {
                Image(systemName: Theme.Icon.externalLink)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.Colors.inkSubtle)
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: - Advanced

    private var advanced: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s1) {
            Text("Environment  \(Config.sentryEnvironment)")
            Text("API  \(Config.apiBaseURL.absoluteString)")
                .textSelection(.enabled)
        }
        .font(.system(.footnote, design: .monospaced))
        .foregroundStyle(Theme.Colors.inkMuted)
        .padding(.vertical, Theme.Space.s1)
    }

    // MARK: - Account

    private var deleteAccount: some View {
        VStack(alignment: .leading, spacing: Theme.Space.s1) {
            Button {
                confirmsDelete = true
            } label: {
                PlainRow(title: "Delete my account", tint: Theme.Colors.destructive) {
                    if isDeleting { ProgressView() }
                }
            }
            .buttonStyle(.plain)
            .disabled(isDeleting)

            if let deleteMessage {
                Text(deleteMessage)
                    .textStyle(Theme.Fonts.Role.meta)
                    .foregroundStyle(Theme.Colors.overdue)
            }
        }
    }

    private func performDelete() async {
        guard let api = syncService.apiService else { return }
        isDeleting = true
        deleteMessage = nil
        defer { isDeleting = false }
        do {
            // The server removes the Clerk user too, so all that's left is
            // local state and the session.
            try await api.deleteMe()
            clearLocalData()
            syncService.reset()
            await authService.signOut()
            dismiss()
        } catch {
            deleteMessage = "Couldn’t delete your account. Try again."
        }
    }

    private func clearLocalData() {
        do {
            try modelContext.delete(model: TodoItem.self)
            try modelContext.delete(model: TodoUrl.self)
            try modelContext.delete(model: TodoListModel.self)
            try modelContext.save()
        } catch {
            print("[Settings] Failed to clear local data: \(error)")
        }
    }
}

/// Automatic, or any zone the system knows, with search.
struct TimezonePickerView: View {
    @Environment(UserPreferencesService.self) private var preferences
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var zones: [String] {
        let known = TimeZone.knownTimeZoneIdentifiers
        let all = known.contains(preferences.timezone) ? known : [preferences.timezone] + known
        guard !query.isEmpty else { return all }
        return all.filter { TimezoneLabel.text($0).localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                Masthead(title: "Timezone", subline: "Where your midnight is")
                if query.isEmpty {
                    choice(
                        "Automatic",
                        detail: TimezoneLabel.text(UserPreferencesService.deviceTimeZone),
                        isOn: preferences.timezoneAuto
                    ) {
                        Task { await preferences.setAutomaticTimezone() }
                    }
                }
                ForEach(zones, id: \.self) { zone in
                    choice(TimezoneLabel.text(zone), isOn: !preferences.timezoneAuto && preferences.timezone == zone) {
                        Task { await preferences.setManualTimezone(zone) }
                    }
                }
            }
            .padding(.bottom, Theme.Space.s16)
        }
        .background(Theme.Colors.canvas)
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func choice(_ title: String, detail: String? = nil, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button {
            action()
            dismiss()
        } label: {
            VStack(spacing: 0) {
                PlainRow(title: title) {
                    if let detail {
                        Text(detail)
                            .textStyle(Theme.Fonts.Role.body)
                            .foregroundStyle(Theme.Colors.inkMuted)
                    }
                    if isOn {
                        Image(systemName: Theme.Icon.done)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(Theme.Colors.ink)
                    }
                }
                Hairline()
            }
            .padding(.horizontal, Theme.Phone.gutter)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

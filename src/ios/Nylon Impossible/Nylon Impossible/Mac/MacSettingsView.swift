//
//  MacSettingsView.swift
//  Nylon Impossible
//
//  The Settings window (⌘,). The same contents as iOS Settings — appearance,
//  timezone (automatic, or picked by hand), your account, signing out and
//  deleting the account — plus the Mac's own: the menu bar icon, the
//  quick-add hotkey and the Dock badge. A native grouped form, because that's
//  what a Mac Settings window is; the words and the order follow the app.
//

#if os(macOS)
import AppKit
import ClerkKit
import SwiftData
import SwiftUI

struct MacSettingsView: View {
    enum Tab: Hashable { case general, account }

    @State private var tab: Tab = .general

    var body: some View {
        TabView(selection: $tab) {
            MacGeneralSettings()
                .tabItem { Label("General", systemImage: Theme.Icon.settings) }
                .tag(Tab.general)
            MacAccountSettings()
                .tabItem { Label("Account", systemImage: "person.crop.circle") }
                .tag(Tab.account)
        }
        .frame(width: 520)
        .fixedSize(horizontal: false, vertical: true)
    }
}

// MARK: - General

struct MacGeneralSettings: View {
    @Environment(UserPreferencesService.self) private var preferences
    @Environment(MacSettings.self) private var settings
    @State private var isRecording = false

    var body: some View {
        @Bindable var settings = settings
        Form {
            Section {
                Picker("Appearance", selection: Binding(
                    get: { preferences.theme },
                    set: { value in Task { await preferences.setTheme(value) } }
                )) {
                    Text("System").tag("system")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                .pickerStyle(.segmented)
            } footer: {
                Text("Synced across your devices.")
                    .foregroundStyle(.secondary)
            }

            Section {
                Toggle("Set timezone automatically", isOn: Binding(
                    get: { preferences.timezoneAuto },
                    set: { automatic in
                        Task {
                            if automatic {
                                await preferences.setAutomaticTimezone()
                            } else {
                                await preferences.setManualTimezone(preferences.timezone)
                            }
                        }
                    }
                ))
                if preferences.timezoneAuto {
                    LabeledContent("Timezone", value: TimezoneLabel.text(UserPreferencesService.deviceTimeZone))
                } else {
                    Picker("Timezone", selection: Binding(
                        get: { preferences.timezone },
                        set: { zone in Task { await preferences.setManualTimezone(zone) } }
                    )) {
                        ForEach(Self.zones(including: preferences.timezone), id: \.self) { zone in
                            Text(TimezoneLabel.text(zone)).tag(zone)
                        }
                    }
                }
            } footer: {
                Text("Today moves to This Week, and This Week to Someday, at your local midnight. A todo gets at least a full day in Today.")
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Section("This Mac") {
                Toggle("Show Nylon in the menu bar", isOn: $settings.showsMenuBarIcon)
                Toggle("Show today’s count on the Dock icon", isOn: $settings.showsDockBadge)
                Toggle("Quick add from anywhere", isOn: Binding(
                    get: { settings.hotKeyEnabled },
                    set: { enabled in
                        settings.hotKeyEnabled = enabled
                        MacServices.shared.applyHotKey()
                    }
                ))
                if settings.hotKeyEnabled {
                    LabeledContent("Shortcut") {
                        HotKeyRecorder(shortcut: settings.hotKey, isRecording: $isRecording) { shortcut in
                            settings.hotKey = shortcut
                            MacServices.shared.applyHotKey()
                        }
                    }
                    if settings.hotKeyStatus == .unavailable {
                        Text("Another app is using \(settings.hotKey.displayString). Pick a different shortcut.")
                            .foregroundStyle(Theme.Colors.overdue)
                    }
                }
            }
        }
        .formStyle(.grouped)
    }

    /// Every zone the system knows, with the current one first if it isn't
    /// among them (an old identifier synced from another device).
    static func zones(including current: String) -> [String] {
        let known = TimeZone.knownTimeZoneIdentifiers
        return known.contains(current) ? known : [current] + known
    }
}

/// Click, then press the new shortcut. Escape cancels; a combination without
/// ⌃, ⌥ or ⌘ is refused, since it would fire while typing in other apps.
struct HotKeyRecorder: View {
    let shortcut: HotKeyShortcut
    @Binding var isRecording: Bool
    let onChange: (HotKeyShortcut) -> Void

    @State private var monitor: Any?

    var body: some View {
        Button {
            isRecording ? stop() : start()
        } label: {
            Text(isRecording ? "Type a shortcut…" : shortcut.displayString)
                .monospacedDigit()
                .frame(minWidth: 110)
        }
        .onDisappear(perform: stop)
        .accessibilityLabel(isRecording ? "Recording shortcut" : "Quick add shortcut, \(shortcut.displayString)")
    }

    private func start() {
        isRecording = true
        // The hotkey would otherwise fire on the combination being recorded.
        MacServices.shared.hotKey?.unregister()
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            if event.keyCode == 53 { // Escape
                stop()
                return nil
            }
            let candidate = HotKeyShortcut(keyCode: UInt32(event.keyCode), modifierFlags: event.modifierFlags)
            guard candidate.isValid else {
                NSSound.beep()
                return nil
            }
            onChange(candidate)
            stop()
            return nil
        }
    }

    private func stop() {
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
        if isRecording {
            isRecording = false
            MacServices.shared.applyHotKey()
        }
    }
}

// MARK: - Account

struct MacAccountSettings: View {
    @Environment(AuthService.self) private var authService
    @Environment(SyncService.self) private var syncService
    @Environment(\.modelContext) private var modelContext
    @Environment(\.screenRoute) private var screenRoute

    @State private var confirmsDelete = false
    @State private var isDeleting = false
    @State private var deleteMessage: String?

    private var name: String {
        if screenRoute != nil { return "Charlie Gleason" }
        return authService.userDisplayName ?? authService.userEmail ?? "Not signed in"
    }

    private var isSignedIn: Bool { screenRoute != nil || authService.isSignedIn }

    var body: some View {
        Form {
            Section {
                HStack(spacing: Theme.Space.s3) {
                    AvatarView(
                        imageURL: screenRoute == nil ? authService.userImageURL : nil,
                        initials: screenRoute == nil ? (authService.userInitials ?? "?") : "CG",
                        size: 40
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(name).font(.headline)
                        if let email = screenRoute == nil ? authService.userEmail : "charlie@example.com" {
                            Text(email).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    if isSignedIn {
                        Button("Sign Out") {
                            Task { await authService.signOut() }
                        }
                    }
                }
                .padding(.vertical, Theme.Space.s1)
            }

            Section {
                Link("Privacy Policy", destination: URL(string: "https://nylonimpossible.com/privacy")!)
                Link("Terms of Service", destination: URL(string: "https://nylonimpossible.com/terms")!)
            }

            if isSignedIn {
                Section {
                    HStack {
                        Button("Delete Account…", role: .destructive) { confirmsDelete = true }
                            .disabled(isDeleting)
                        if isDeleting { ProgressView().controlSize(.small) }
                    }
                    if let deleteMessage {
                        Text(deleteMessage).foregroundStyle(Theme.Colors.overdue)
                    }
                } footer: {
                    Text("Permanently deletes your account and all of your todos. This can’t be undone.")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .alert("Delete your account?", isPresented: $confirmsDelete) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { Task { await performDelete() } }
        } message: {
            Text("This permanently deletes your account and all of your todos. This can’t be undone.")
        }
    }

    private func performDelete() async {
        guard let api = syncService.apiService else { return }
        isDeleting = true
        deleteMessage = nil
        defer { isDeleting = false }
        do {
            try await api.deleteMe()
            // The account is already gone on the server, so a failed local
            // wipe isn't worth surfacing or retrying: sign out regardless.
            try? modelContext.delete(model: TodoItem.self)
            try? modelContext.delete(model: TodoUrl.self)
            try? modelContext.delete(model: TodoListModel.self)
            try? modelContext.save()
            syncService.reset()
            await authService.signOut()
        } catch {
            deleteMessage = "Couldn’t delete your account. Try again."
        }
    }
}
#endif

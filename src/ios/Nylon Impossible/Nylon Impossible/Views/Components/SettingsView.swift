//
//  SettingsView.swift
//  Nylon Impossible
//

import ClerkKit
import SwiftData
import SwiftUI

struct SettingsView: View {
    @Environment(UserPreferencesService.self) private var preferencesService
    @Environment(SyncService.self) private var syncService
    @Environment(AuthService.self) private var authService
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var showDeleteConfirm = false
    @State private var isDeletingAccount = false
    @State private var deleteMessage: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Appearance", selection: Binding(
                        get: { preferencesService.theme },
                        set: { newValue in
                            Task { await preferencesService.setTheme(newValue) }
                        }
                    )) {
                        Text("System").tag("system")
                        Text("Light").tag("light")
                        Text("Dark").tag("dark")
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("Appearance")
                } footer: {
                    Text("System follows your device's light or dark setting.")
                }

                timezoneSection

                aboutSection

                #if DEBUG
                advancedSection
                #endif

                dangerZoneSection
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .alert("Delete account?", isPresented: $showDeleteConfirm) {
                Button("Cancel", role: .cancel) {}
                Button("Delete", role: .destructive) {
                    Task { await deleteAccount() }
                }
            } message: {
                Text("This permanently deletes your account and all of your todos. This cannot be undone.")
            }
        }
    }

    // MARK: - Timezone

    private static let automaticTag = "automatic"

    // Minimal for now: Automatic plus every zone the system knows. The
    // redesign rebuilds Settings in its own components later.
    @ViewBuilder
    private var timezoneSection: some View {
        let device = UserPreferencesService.deviceTimeZone
        let automaticZone = preferencesService.timezoneAuto ? preferencesService.timezone : device
        Section {
            Picker("Timezone", selection: Binding(
                get: {
                    preferencesService.timezoneAuto ? Self.automaticTag : preferencesService.timezone
                },
                set: { newValue in
                    Task {
                        if newValue == Self.automaticTag {
                            await preferencesService.setAutomaticTimezone()
                        } else {
                            await preferencesService.setManualTimezone(newValue)
                        }
                    }
                }
            )) {
                Text("Automatic (\(Self.label(automaticZone)))").tag(Self.automaticTag)
                ForEach(Self.zones(including: preferencesService.timezone), id: \.self) { zone in
                    Text(Self.label(zone)).tag(zone)
                }
            }
            .pickerStyle(.navigationLink)
        } header: {
            Text("Timezone")
        } footer: {
            Text("Today's todos move to This Week, and This Week's to Someday, at your local midnight.")
        }
    }

    private static func label(_ zone: String) -> String {
        zone.replacingOccurrences(of: "_", with: " ")
    }

    /// Every known zone, plus the stored one if the system list lacks it (the
    /// "UTC" default isn't in `knownTimeZoneIdentifiers`).
    private static func zones(including stored: String) -> [String] {
        let known = TimeZone.knownTimeZoneIdentifiers
        return known.contains(stored) ? known : [stored] + known
    }

    // MARK: - About

    @ViewBuilder
    private var aboutSection: some View {
        Section {
            Link("Privacy Policy", destination: URL(string: "https://nylonimpossible.com/privacy")!)
            Link("Terms of Service", destination: URL(string: "https://nylonimpossible.com/terms")!)
        } header: {
            Text("About")
        }
    }

    // MARK: - Advanced

    // Debug-only build/connection info — the env + API base that used to sit in
    // the floating header banner on DEBUG builds. Wrapped in `#if DEBUG` at the
    // call site, so this never ships in a release build.
    @ViewBuilder
    private var advancedSection: some View {
        Section {
            LabeledContent("Environment", value: Config.sentryEnvironment)
            LabeledContent("API", value: Config.apiBaseURL.absoluteString)
                .textSelection(.enabled)
        } header: {
            Text("Advanced")
        } footer: {
            Text("Build and connection details, shown in debug builds only.")
        }
        .font(.system(.body, design: .monospaced))
        .foregroundStyle(Color.appStrong)
    }

    // MARK: - Danger zone

    @ViewBuilder
    private var dangerZoneSection: some View {
        Section {
            Button(role: .destructive) {
                showDeleteConfirm = true
            } label: {
                HStack {
                    Text("Delete my account")
                    if isDeletingAccount {
                        Spacer()
                        ProgressView()
                    }
                }
            }
            .disabled(isDeletingAccount)

            if let deleteMessage {
                Text(deleteMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        } header: {
            Text("Danger zone")
        } footer: {
            Text("Permanently delete your account and all of your data. This cannot be undone.")
        }
    }

    private func deleteAccount() async {
        guard let api = syncService.apiService else { return }
        isDeletingAccount = true
        deleteMessage = nil
        defer { isDeletingAccount = false }

        do {
            // The server also removes the Clerk user, so afterward we only clear
            // local state and sign out.
            try await api.deleteMe()
            clearLocalData()
            syncService.reset()
            await authService.signOut()
            dismiss()
        } catch {
            deleteMessage = "Couldn't delete your account. Try again."
        }
    }

    private func clearLocalData() {
        do {
            try modelContext.delete(model: TodoItem.self)
            try modelContext.delete(model: TodoUrl.self)
            try modelContext.save()
        } catch {
            print("[Settings] Failed to clear local data: \(error)")
        }
    }
}

#Preview {
    @Previewable @State var preferencesService = UserPreferencesService(
        apiService: APIService(authService: AuthService())
    )
    @Previewable @State var syncService = SyncService(authService: AuthService())
    @Previewable @State var authService = AuthService()

    SettingsView()
        .environment(preferencesService)
        .environment(syncService)
        .environment(authService)
        .environment(Clerk.shared)
        .modelContainer(
            for: [TodoItem.self, TodoUrl.self],
            inMemory: true
        )
}

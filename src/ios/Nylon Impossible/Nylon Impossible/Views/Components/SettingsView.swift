//
//  SettingsView.swift
//  Nylon Impossible
//

import ClerkKit
import CoreLocation
import SwiftData
import SwiftUI

@Observable
@MainActor
private final class LocationHelper: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    var isLocating = false
    var onResult: ((String) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func request(onResult: @escaping (String) -> Void) {
        self.onResult = onResult
        isLocating = true
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        default:
            isLocating = false
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                manager.requestLocation()
            default:
                self.isLocating = false
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.first else {
            Task { @MainActor in self.isLocating = false }
            return
        }
        let geocoder = CLGeocoder()
        geocoder.reverseGeocodeLocation(location) { [weak self] placemarks, _ in
            Task { @MainActor in
                if let placemark = placemarks?.first {
                    let parts = [placemark.locality, placemark.administrativeArea ?? placemark.country]
                        .compactMap { $0 }
                        .filter { !$0.isEmpty }
                    let result = parts.joined(separator: ", ")
                    if !result.isEmpty {
                        self?.onResult?(result)
                    }
                }
                self?.isLocating = false
            }
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.isLocating = false
        }
    }
}

struct SettingsView: View {
    @Environment(UserPreferencesService.self) private var preferencesService
    @Environment(SyncService.self) private var syncService
    @Environment(AuthService.self) private var authService
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var locationText = ""
    @State private var locationHelper = LocationHelper()

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

                // Completed todos collapse via the bottom-of-list accordion
                // (matching web), so there's no separate settings toggle here.

                // AI features are gated on this toggle (not the plan), so it's
                // available to every user to turn on or off.
                Section {
                    Toggle("Use AI", isOn: Binding(
                        get: { preferencesService.aiEnabled },
                        set: { newValue in
                            Task {
                                await preferencesService.setAI(enabled: newValue)
                            }
                        }
                    ))

                    if let error = preferencesService.error {
                        Text(error.localizedDescription)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                } header: {
                    Text("AI Features")
                } footer: {
                    Text("When enabled, AI helps enrich todos by doing research tasks, pulling out metadata, and finding locations.")
                }

                Section {
                    TextField("e.g. Los Angeles, CA", text: $locationText)
                        .onSubmit {
                            Task { await preferencesService.setLocation(locationText) }
                        }
                    Button {
                        locationHelper.request { result in
                            locationText = result
                            Task { await preferencesService.setLocation(result) }
                        }
                    } label: {
                        HStack {
                            Text("Use Current Location")
                            if locationHelper.isLocating {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(locationHelper.isLocating)
                } header: {
                    Text("Location")
                } footer: {
                    Text("Used to find local venues when researching location todos.")
                }

                ImportSettingsSection()

                aboutSection

                #if DEBUG
                advancedSection
                #endif

                dangerZoneSection
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                locationText = preferencesService.location ?? ""
            }
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
            try modelContext.delete(model: TodoMessage.self)
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
            for: [TodoItem.self, TodoUrl.self, TodoMessage.self],
            inMemory: true
        )
}

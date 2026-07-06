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
    // Google rejects the shorthand `tasks.readonly`, so the fully-qualified URL
    // is required — same scope string the web client requests.
    private static let googleTasksScope = "https://www.googleapis.com/auth/tasks.readonly"

    @Environment(UserPreferencesService.self) private var preferencesService
    @Environment(SyncService.self) private var syncService
    @Environment(AuthService.self) private var authService
    @Environment(Clerk.self) private var clerk
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var locationText = ""
    @State private var locationHelper = LocationHelper()

    @State private var isConnectingGoogle = false
    @State private var isImporting = false
    @State private var importMessage: String?
    @State private var reviewTodos: [ImportedDatedTodo] = []
    @State private var showReview = false

    @State private var showDeleteConfirm = false
    @State private var isDeletingAccount = false
    @State private var deleteMessage: String?

    // A Google account is only usable for import once it's connected *and* has
    // granted the Tasks scope — a plain sign-in connection won't have it.
    private var googleAccount: ExternalAccount? {
        clerk.user?.externalAccounts.first { $0.provider == "google" }
    }

    private var googleTasksReady: Bool {
        guard let scopes = googleAccount?.approvedScopes else { return false }
        return scopes.split(separator: " ").map(String.init).contains(Self.googleTasksScope)
    }

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

                // AI is a paid feature, so the toggle only appears for pro users.
                if preferencesService.isPro {
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

                importSection

                aboutSection

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
            .sheet(isPresented: $showReview) {
                ImportReviewSheet(datedTodos: reviewTodos)
                    .environment(syncService)
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

    // MARK: - Import

    @ViewBuilder
    private var importSection: some View {
        Section {
            if googleTasksReady {
                Button {
                    Task { await runImport() }
                } label: {
                    HStack {
                        Text("Import from Google Tasks")
                        if isImporting {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .disabled(isImporting)
            } else {
                Button {
                    Task { await connectGoogle() }
                } label: {
                    HStack {
                        Text(googleAccount == nil ? "Connect Google" : "Reconnect Google for Tasks")
                        if isConnectingGoogle {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .disabled(isConnectingGoogle)
            }

            if let importMessage {
                Text(importMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("Import")
        } footer: {
            if googleTasksReady {
                Text("Bring across open tasks from your Google Tasks “My Tasks” list, with due dates and link research. Already-imported tasks are skipped, so it's safe to run again.")
            } else {
                Text("Connect your Google account to import open tasks from Google Tasks. We only request read-only access to your tasks.")
            }
        }
    }

    private func connectGoogle() async {
        guard let user = clerk.user else { return }
        isConnectingGoogle = true
        importMessage = nil
        defer { isConnectingGoogle = false }

        do {
            // Mirror the web client: request the Tasks scope on a (re)connection.
            // createExternalAccount returns an account whose verification carries
            // the OAuth redirect URL; reauthorize() drives the web-auth session
            // and refreshes the client so approvedScopes updates.
            let account = try await user.createExternalAccount(
                provider: .google,
                additionalScopes: [Self.googleTasksScope]
            )
            _ = try await account.reauthorize()
        } catch is CancellationError {
            // User dismissed the sign-in web session — leave things as they were.
        } catch {
            importMessage = "Couldn't connect Google. Try again."
        }
    }

    private func runImport() async {
        guard let api = syncService.apiService else { return }
        isImporting = true
        importMessage = nil
        defer { isImporting = false }

        do {
            let result = try await api.importGoogleTasks()
            // Pull the freshly-imported todos into SwiftData.
            await syncService.sync()

            if result.imported == 0 {
                importMessage = result.skipped > 0
                    ? "You're up to date — nothing new to import."
                    : "No open tasks found in Google Tasks."
                return
            }

            let count = result.imported
            importMessage = "Imported \(count) \(count == 1 ? "task" : "tasks") from Google."

            // Google doesn't share repeat schedules, so offer to set them for any
            // dated imports.
            if !result.datedTodos.isEmpty {
                reviewTodos = result.datedTodos
                showReview = true
            }
        } catch {
            importMessage = importErrorMessage(error)
        }
    }

    /// Surface the API's own message for a failed import (e.g. the 400 asking the
    /// user to connect Google with Tasks access), falling back to a generic line.
    private func importErrorMessage(_ error: Error) -> String {
        if let apiError = error as? APIError,
           case let .serverError(_, message?, _) = apiError {
            return message
        }
        return "Couldn't import from Google Tasks. Try again."
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

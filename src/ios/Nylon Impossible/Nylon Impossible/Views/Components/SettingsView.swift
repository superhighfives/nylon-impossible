//
//  SettingsView.swift
//  Nylon Impossible
//

import CoreLocation
import MapKit
import SwiftUI

@Observable
@MainActor
private final class LocationHelper {
    var isLocating = false

    func request() async -> String? {
        isLocating = true
        defer { isLocating = false }

        let manager = CLLocationManager()
        manager.desiredAccuracy = kCLLocationAccuracyKilometer

        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }

        // Get a single location update with a 10-second timeout
        let locationTask = Task<CLLocation?, Never> {
            do {
                for try await update in CLLocationUpdate.updates {
                    if let location = update.location {
                        return location
                    }
                }
            } catch {}
            return nil
        }
        let timeoutTask = Task<Void, Never> {
            try? await Task.sleep(for: .seconds(10))
            locationTask.cancel()
        }
        let location = await locationTask.value
        timeoutTask.cancel()

        guard let location else { return nil }
        return await reverseGeocode(location)
    }

    private func reverseGeocode(_ location: CLLocation) async -> String? {
        guard let request = MKReverseGeocodingRequest(location: location) else {
            return nil
        }
        let mapItems: [MKMapItem]
        do {
            mapItems = try await withCheckedThrowingContinuation { continuation in
                request.getMapItems { items, error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(returning: items)
                    }
                }
            }
        } catch {
            return nil
        }
        guard let placemark = mapItems.first?.placemark else {
            return nil
        }
        let parts = [placemark.locality, placemark.administrativeArea ?? placemark.country]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
        let result = parts.joined(separator: ", ")
        return result.isEmpty ? nil : result
    }
}

struct SettingsView: View {
    @Environment(UserPreferencesService.self) private var preferencesService
    @Environment(\.dismiss) private var dismiss

    @State private var locationText = ""
    @State private var locationHelper = LocationHelper()

    var body: some View {
        NavigationStack {
            List {
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
                        Task {
                            if let result = await locationHelper.request() {
                                locationText = result
                                await preferencesService.setLocation(result)
                            }
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
        }
    }
}

#Preview {
    @Previewable @State var preferencesService = UserPreferencesService(
        apiService: APIService(authService: AuthService())
    )

    SettingsView()
        .environment(preferencesService)
}

//
//  SettingsView.swift
//  Nylon Impossible
//

import CoreLocation
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

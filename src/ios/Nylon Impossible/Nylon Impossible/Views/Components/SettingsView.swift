//
//  SettingsView.swift
//  Nylon Impossible
//

import SwiftUI

struct SettingsView: View {
    @Environment(UserPreferencesService.self) private var preferencesService
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Toggle("Use AI", isOn: Binding(
                        get: { preferencesService.aiEnabled },
                        set: { _ in
                            Task {
                                await preferencesService.toggleAI()
                            }
                        }
                    ))
                } header: {
                    Text("AI Features")
                } footer: {
                    Text("When enabled, AI helps extract multiple todos from natural language and parse dates.")
                }
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
        }
    }
}

#Preview {
    SettingsView()
}

//
//  ImportSettingsSection.swift
//  Nylon Impossible
//
//  The Google Tasks connect/import controls from Settings, split into their own
//  view so SettingsView stays within SwiftLint's length limits. Owns the whole
//  import flow's state and reads Clerk + the sync service from the environment.
//

import ClerkKit
import SwiftUI

struct ImportSettingsSection: View {
    // Google rejects the shorthand `tasks.readonly`, so the fully-qualified URL
    // is required — same scope string the web client requests.
    private static let googleTasksScope = "https://www.googleapis.com/auth/tasks.readonly"

    @Environment(SyncService.self) private var syncService
    @Environment(Clerk.self) private var clerk

    @State private var isConnectingGoogle = false
    @State private var isImporting = false
    @State private var importMessage: String?
    @State private var reviewTodos: [ImportedDatedTodo] = []
    @State private var showReview = false

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
        .sheet(isPresented: $showReview) {
            ImportReviewSheet(datedTodos: reviewTodos)
                .environment(syncService)
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
}

//
//  Nylon_ImpossibleApp.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI
import SwiftData
import ClerkKit
import AppIntents
import BackgroundTasks

@main
struct Nylon_ImpossibleApp: App {
    @State private var authService = AuthService()
    @State private var syncService: SyncService?
    
    init() {
        Clerk.configure(publishableKey: Config.clerkPublishableKey)
        registerBackgroundTasks()
    }

    private func registerBackgroundTasks() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.nylonimpossible.backgroundsync",
            using: nil
        ) { task in
            Self.handleBackgroundSync(task: task as! BGAppRefreshTask)
        }
    }

    private static func handleBackgroundSync(task: BGAppRefreshTask) {
        // Schedule the next refresh before doing work, so iOS can wake us again if needed
        scheduleBackgroundSync()

        let container = SharedModelContainer.shared

        let workTask = Task { @MainActor in
            let sharedDefaults = UserDefaults(suiteName: "group.com.superhighfives.Nylon-Impossible")
            if let defaults = sharedDefaults, let svc = BackgroundSyncService(sharedDefaults: defaults) {
                do {
                    try await svc.sync(modelContainer: container)
                    task.setTaskCompleted(success: true)
                } catch {
                    print("[BGTask] Sync error: \(error)")
                    task.setTaskCompleted(success: false)
                }
            } else {
                task.setTaskCompleted(success: false)
            }
        }

        task.expirationHandler = {
            workTask.cancel()
            task.setTaskCompleted(success: false)
        }
    }

    private static func scheduleBackgroundSync() {
        let request = BGAppRefreshTaskRequest(identifier: "com.nylonimpossible.backgroundsync")
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }
    
    var body: some Scene {
        WindowGroup {
            RootView(syncService: syncService)
                .environment(Clerk.shared)
                .environment(authService)
                .onAppear {
                    if syncService == nil {
                        syncService = SyncService(authService: authService)
                    }
                }
                .task {
                    // Register app shortcuts on launch
                    NylonShortcuts.updateAppShortcutParameters()
                }
        }
        .modelContainer(SharedModelContainer.shared)
    }
}

struct RootView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @Environment(Clerk.self) private var clerk
    @Environment(AuthService.self) private var authService
    var syncService: SyncService?

    @State private var hasTriggeredInitialSync = false
    
    private var isSignedIn: Bool {
        clerk.user != nil
    }
    
    var body: some View {
        Group {
            if clerk.client == nil {
                // Loading state
                ZStack {
                    GradientBackground()
                    ProgressView()
                }
            } else if isSignedIn {
                if let syncService {
                    ContentView()
                        .environment(syncService)
                        .onAppear {
                            syncService.setModelContext(modelContext)
                            triggerInitialSync()
                        }
                } else {
                    ZStack {
                        GradientBackground()
                        ProgressView()
                    }
                }
            } else {
                SignInView()
            }
        }
        .animation(.easeInOut, value: isSignedIn)
        .animation(.easeInOut, value: clerk.client != nil)
        .onChange(of: isSignedIn) { _, signedIn in
            if signedIn {
                // Persist userId and a fresh auth token to shared UserDefaults for
                // Siri, Share Extension, and BackgroundSyncService access
                authService.persistUserIdToSharedDefaults()
                Task { await authService.persistAuthTokenToSharedDefaults() }
                hasTriggeredInitialSync = false
                triggerInitialSync()
            } else {
                // Reset sync on sign out
                syncService?.reset()
                hasTriggeredInitialSync = false
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard isSignedIn, let syncService else { return }

            switch newPhase {
            case .active:
                syncService.connectWebSocket()
                // Refresh the stored auth token so BackgroundSyncService has a valid
                // credential for the next ~50 minutes
                Task { await authService.persistAuthTokenToSharedDefaults() }
            case .background, .inactive:
                syncService.disconnectWebSocket()
            @unknown default:
                break
            }
        }
    }
    
    private func triggerInitialSync() {
        guard !hasTriggeredInitialSync else { return }
        guard isSignedIn else { return }
        guard let syncService else { return }
        
        hasTriggeredInitialSync = true
        
        Task {
            // First, migrate any existing local todos
            await syncService.migrateLocalTodos()
            // Then sync with server
            await syncService.sync()
            // Connect WebSocket for real-time updates
            syncService.connectWebSocket()
        }
    }
}

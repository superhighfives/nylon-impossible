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
import Sentry

@main
struct Nylon_ImpossibleApp: App {
    @State private var authService = AuthService()
    @State private var syncService: SyncService?
    @State private var preferencesService: UserPreferencesService?
    
    init() {
        Clerk.configure(publishableKey: Config.clerkPublishableKey)
        Self.initSentry()
        registerBackgroundTasks()
    }

    private static func initSentry() {
        guard let dsn = Config.sentryDSN else { return }

        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = "production"
            options.tracesSampleRate = 0.1
            options.enableAutoPerformanceTracing = true
            // Privacy: don't attach screenshots or view hierarchy
            options.attachScreenshot = false
            options.attachViewHierarchy = false
        }
    }

    private func registerBackgroundTasks() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: BackgroundSyncService.backgroundSyncTaskIdentifier,
            using: nil
        ) { task in
            Self.handleBackgroundSync(task: task)
        }
    }

    private static func handleBackgroundSync(task: BGTask) {
        guard let appRefreshTask = task as? BGAppRefreshTask else {
            task.setTaskCompleted(success: false)
            return
        }

        // Schedule the next refresh before doing work, so iOS can wake us again if needed
        scheduleBackgroundSync()

        let container = SharedModelContainer.shared
        let completion = BGTaskCompletionGuard(task: appRefreshTask)

        let workTask = Task { @MainActor in
            let sharedDefaults = UserDefaults(suiteName: BackgroundSyncService.appGroupSuiteName)
            if let defaults = sharedDefaults, let svc = BackgroundSyncService(sharedDefaults: defaults) {
                do {
                    try await svc.sync(modelContainer: container)
                    completion.complete(success: true)
                } catch {
                    SentrySDK.capture(error: error) { scope in
                        scope.setTag(value: "background-sync", key: "area")
                    }
                    print("[BGTask] Sync error: \(error)")
                    completion.complete(success: false)
                }
            } else {
                completion.complete(success: false)
            }
        }

        appRefreshTask.expirationHandler = {
            workTask.cancel()
            completion.complete(success: false)
        }
    }

    private static func scheduleBackgroundSync() {
        let request = BGAppRefreshTaskRequest(identifier: BackgroundSyncService.backgroundSyncTaskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            print("[BGTask] Failed to schedule background sync: \(error)")
        }
    }
    
    var body: some Scene {
        WindowGroup {
            RootView(syncService: syncService, preferencesService: preferencesService)
                .environment(Clerk.shared)
                .environment(authService)
                .onAppear {
                    if syncService == nil {
                        let apiService = APIService(authService: authService)
                        syncService = SyncService(authService: authService)
                        preferencesService = UserPreferencesService(apiService: apiService)
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
    var preferencesService: UserPreferencesService?

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
                if let syncService, let preferencesService {
                    ContentView()
                        .environment(syncService)
                        .environment(preferencesService)
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
                // Set Sentry user context (opaque ID only — no PII)
                if let userId = authService.userId {
                    let sentryUser = Sentry.User(userId: userId)
                    SentrySDK.setUser(sentryUser)
                }
                // Migrate any existing UserDefaults token to Keychain (one-time)
                authService.migrateAuthTokenFromUserDefaultsToKeychain()
                // Persist userId to shared UserDefaults and a fresh auth token to
                // the Keychain for Siri, Share Extension, and BackgroundSyncService
                authService.persistUserIdToSharedDefaults()
                Task { await authService.persistAuthTokenToKeychain() }
                hasTriggeredInitialSync = false
                triggerInitialSync()
            } else {
                // Clear Sentry user on sign out
                SentrySDK.setUser(nil)
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
                Task { await authService.persistAuthTokenToKeychain() }
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
            // Fetch user preferences
            await preferencesService?.fetchPreferences()
        }
    }
}

// MARK: - Private Helpers

/// Ensures BGTask.setTaskCompleted(success:) is called exactly once, even if both the
/// worker task and the expiration handler fire concurrently.
private final class BGTaskCompletionGuard: @unchecked Sendable {
    private let lock = NSLock()
    private var isComplete = false
    private let task: BGAppRefreshTask

    init(task: BGAppRefreshTask) {
        self.task = task
    }

    func complete(success: Bool) {
        lock.withLock {
            guard !isComplete else { return }
            isComplete = true
            task.setTaskCompleted(success: success)
        }
    }
}

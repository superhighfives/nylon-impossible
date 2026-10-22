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
#if os(iOS)
import BackgroundTasks
#endif
import Sentry
#if os(macOS)
import Security
#endif

@main
struct Nylon_ImpossibleApp: App {
    #if os(iOS)
    // Only here to receive Home Screen quick actions — SwiftUI's App has no
    // hook for them. See AppDelegate.swift.
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    #else
    // The Dock badge, the global hotkey and reopening the window from the
    // Dock. See Mac/MacAppDelegate.swift.
    @NSApplicationDelegateAdaptor(MacAppDelegate.self) private var appDelegate
    #endif
    @State private var authService = AuthService()
    @State private var syncService: SyncService?
    @State private var preferencesService: UserPreferencesService?
    @State private var feedbackService: FeedbackService?
    
    init() {
        Clerk.configure(publishableKey: Config.clerkPublishableKey, options: Self.clerkOptions)
        Self.initSentry()
        #if os(iOS)
        registerBackgroundTasks()
        #endif
        #if DEBUG
        if let link = ScreenRoute.launchDeepLink { QuickActionService.shared.post(link) }
        #endif
    }

    /// ClerkKit's keychain doesn't use the data-protection keychain, so on
    /// macOS its items live in the login keychain with an access list tied to
    /// the code signature of whichever build wrote them. A Debug or test build
    /// (unsigned, or development-signed) writing under the release service
    /// name leaves items the TestFlight/App Store build can't read without a
    /// password prompt on every launch, which "Always Allow" doesn't clear.
    /// Debug builds on the Mac therefore keep Clerk's items under their own
    /// service name. Release builds use Clerk's default (the bundle ID).
    ///
    /// The same trap catches Debug builds that aren't signed by Xcode: an
    /// unsigned (ad-hoc) build reading the items a development-signed build
    /// wrote prompts for the login password, and each ad-hoc build is a new
    /// signature, so it prompts every time. Those builds, and screenshot
    /// routes (`-NylonScreen`, which run without an account), get a service
    /// of their own for each launch: there's nothing there to read, so nothing
    /// to prompt for. They can't stay signed in across launches, and don't
    /// need to.
    static var clerkOptions: Clerk.Options {
        #if os(macOS) && DEBUG
        return Clerk.Options(keychainConfig: .init(service: clerkLaunchKeychainService))
        #else
        return Clerk.Options()
        #endif
    }

    static let clerkDebugKeychainService = "com.superhighfives.Nylon-Impossible.debug"

    #if os(macOS) && DEBUG
    /// Worked out once per launch, so a second read of `clerkOptions` gets the
    /// same service rather than a fresh, empty one.
    private static let clerkLaunchKeychainService: String = {
        let isolated = ScreenRoute.launch != nil || !isSignedByTeam
        return isolated ? "\(clerkDebugKeychainService).\(UUID().uuidString)" : clerkDebugKeychainService
    }()

    /// Whether this build carries a team's signature (Xcode's development
    /// signing) rather than an ad-hoc one (`CODE_SIGNING_ALLOWED=NO`, as CI and
    /// command-line builds use). The App Group container can't tell them apart:
    /// an unsigned, unsandboxed build still gets one.
    static var isSignedByTeam: Bool {
        var code: SecCode?
        var staticCode: SecStaticCode?
        var info: CFDictionary?
        guard SecCodeCopySelf([], &code) == errSecSuccess, let code,
              SecCodeCopyStaticCode(code, [], &staticCode) == errSecSuccess, let staticCode,
              SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &info) == errSecSuccess,
              let info = info as? [String: Any]
        else { return false }
        return info[kSecCodeInfoTeamIdentifier as String] as? String == AppGroup.teamIdentifier
    }
    #endif

    private static func initSentry() {
        guard let dsn = Config.sentryDSN else { return }

        SentrySDK.start { options in
            options.dsn = dsn
            options.environment = Config.sentryEnvironment
            options.tracesSampleRate = 0.1
            options.enableAutoPerformanceTracing = true
            #if os(iOS)
            // Privacy: don't attach screenshots or view hierarchy. (Sentry
            // never captures either on macOS.)
            options.attachScreenshot = false
            options.attachViewHierarchy = false
            #endif
        }
    }

    #if os(iOS)
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
                    // Timeouts and dropped connections are expected when syncing from a
                    // BGTask and are pure noise in Sentry — skip them like APIService and
                    // SyncService do. The task simply reports failure so iOS reschedules.
                    if !APIError.isTransientNetworkError(error) {
                        SentrySDK.capture(error: error) { scope in
                            scope.setTag(value: "background-sync", key: "area")
                        }
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
    #endif

    var body: some Scene {
        #if os(macOS)
        // The board window, Settings and the menu bar extra; see Mac/MacScenes.swift.
        MacScenes()
        #else
        WindowGroup {
            #if DEBUG
            if let route = ScreenRoute.launch {
                // Screenshot runs: sample data, no sign-in, no real store.
                ScreenRouteRoot(route: route)
            } else {
                signedInRoot
            }
            #else
            signedInRoot
            #endif
        }
        // The iPad board's keys, for the shortcut overlay and menu bar.
        .commands {
            BoardCommands(feedback: feedbackService, showsFeedback: preferencesService?.isAdmin == true)
        }
        #endif
    }

    private var signedInRoot: some View {
        RootView(syncService: syncService, preferencesService: preferencesService, feedbackService: feedbackService)
            .environment(Clerk.shared)
            .environment(authService)
            .onAppear {
                if syncService == nil {
                    let apiService = APIService(authService: authService)
                    syncService = SyncService(authService: authService)
                    preferencesService = UserPreferencesService(apiService: apiService)
                    feedbackService = FeedbackService(apiService: apiService)
                }
            }
            .task {
                // Register app shortcuts on launch
                NylonShortcuts.updateAppShortcutParameters()
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
    /// The admin-only feedback inbox; nil until the services exist.
    var feedbackService: FeedbackService?

    @State private var hasTriggeredInitialSync = false
    
    private var isSignedIn: Bool {
        clerk.user != nil
    }

    /// Maps the synced appearance preference to a SwiftUI color scheme.
    /// nil (for "system" or before preferences load) follows the device.
    private var preferredColorScheme: ColorScheme? {
        switch preferencesService?.theme {
        case "light": return .light
        case "dark": return .dark
        default: return nil
        }
    }

    var body: some View {
        Group {
            if clerk.client == nil {
                // Loading state
                ZStack {
                    Theme.Colors.canvas.ignoresSafeArea()
                    ProgressView()
                }
            } else if isSignedIn {
                if let syncService, let preferencesService {
                    ContentRoot()
                        .environment(syncService)
                        .environment(preferencesService)
                        .environment(feedbackService)
                        .onAppear {
                            syncService.setModelContext(modelContext)
                            triggerInitialSync()
                        }
                } else {
                    ZStack {
                        Theme.Colors.canvas.ignoresSafeArea()
                        ProgressView()
                    }
                }
            } else {
                SignInView()
            }
        }
        .preferredColorScheme(preferredColorScheme)
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
                // The widget reads sign-in state from shared defaults, which
                // only just changed — without this it keeps showing the
                // signed-out card until something else reloads it.
                WidgetRefresh.reload()
            } else {
                // Clear Sentry user on sign out
                SentrySDK.setUser(nil)
                // Reset sync on sign out
                syncService?.reset()
                // Drop cached preference state so the next account doesn't inherit it
                preferencesService?.resetLocalState()
                hasTriggeredInitialSync = false
            }
        }
        // Clerk has loaded and there's no session — the same condition that
        // puts `SignInView` on screen above. Reached two ways: an explicit sign
        // out, and a launch where the stored session had expired or been
        // revoked. Only the first runs `signOut()`, so without this the shared
        // defaults keep naming the last account, and every Clerk-less target
        // reads that as signed in — the widget included, which would leave that
        // account's todos on the Home Screen while the app sits on the sign-in
        // wall. Fires on appear too, because `isSignedIn` starting false is not
        // a change `onChange` can see.
        .onChange(of: clerk.client != nil && !isSignedIn, initial: true) { _, isSignedOut in
            guard isSignedOut else { return }
            authService.clearSharedSessionState()
            // Take the signed-out user's todos off the Home Screen now, rather
            // than leaving them there until the next reload.
            WidgetRefresh.reload()
        }
        .onReceive(NotificationCenter.default.publisher(for: .NSSystemTimeZoneDidChange)) { _ in
            guard isSignedIn else { return }
            Task { await preferencesService?.reportDeviceTimezone() }
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard isSignedIn, let syncService else { return }

            switch newPhase {
            case .active:
                syncService.connectWebSocket()
                // Refresh the stored auth token so BackgroundSyncService has a valid
                // credential for the next ~50 minutes
                Task { await authService.persistAuthTokenToKeychain() }
                // Recompute the badge on foreground so it crosses the day
                // boundary even without a sync round-trip.
                BadgeService.refresh(modelContext: modelContext)
                // Travelling while backgrounded changes the zone without the
                // app seeing the notification below.
                Task { await preferencesService?.reportDeviceTimezone() }
                // The sweep runs at local midnight, usually while the app is
                // backgrounded; this is when the morning note can appear.
                Task { await preferencesService?.refreshLastSweep() }
            case .background, .inactive:
                #if os(iOS)
                // A Mac app keeps its socket while it runs — the menu bar
                // extra, the Dock badge and the desktop widget all show live
                // data with no window focused — so only iOS lets go here.
                syncService.disconnectWebSocket()
                #endif
                // The app's single widget refresh, covering everything that
                // happened while it was open: edits made here, and anything a
                // sync pulled in from the web or another device. Leaving is
                // also the only moment any of it becomes visible — nobody sees
                // the Home Screen from inside the app — so refreshing per
                // mutation or per sync would buy nothing, and it kept WidgetKit
                // out of `SyncService.sync()`, which the test suite drives
                // dozens of times per run.
                WidgetRefresh.reload()
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

#if os(iOS)
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
#endif

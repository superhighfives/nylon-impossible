//
//  Nylon_ImpossibleApp.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI
import SwiftData
import ClerkKit

@main
struct Nylon_ImpossibleApp: App {
    @State private var authService = AuthService()
    @State private var syncService: SyncService?
    
    init() {
        Clerk.configure(publishableKey: Config.clerkPublishableKey)
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
        }
        .modelContainer(for: TodoItem.self)
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
                Task { await syncService.sync() }
                syncService.startPolling()
            case .background, .inactive:
                syncService.stopPolling()
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
            // Start polling for remote changes
            syncService.startPolling()
        }
    }
}

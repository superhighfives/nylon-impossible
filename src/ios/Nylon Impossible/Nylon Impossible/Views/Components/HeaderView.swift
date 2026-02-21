//
//  HeaderView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI

struct HeaderView: View {
    var onSignOut: (() -> Void)?
    var syncState: SyncState = .idle
    
    var body: some View {
        VStack(spacing: 16) {
            // Top bar with sync status and sign out
            HStack {
                // Sync status indicator
                syncStatusView
                
                Spacer()
                
                if let onSignOut {
                    Button {
                        onSignOut()
                    } label: {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: 18))
                            .foregroundStyle(Color.subtitleGray)
                    }
                }
            }
            .frame(height: 24)
            
            // App icon
            ZStack {
                RoundedRectangle(cornerRadius: 24)
                    .fill(LinearGradient.primaryGradient)
                    .frame(width: 64, height: 64)
                    .shadow(color: .black.opacity(0.1), radius: 15, x: 0, y: 10)
                    .shadow(color: .black.opacity(0.1), radius: 6, x: 0, y: 4)
                
                Image(systemName: "checkmark")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundStyle(.white)
            }
            
            // Title with gradient
            Text("My Tasks")
                .font(.system(size: 36, weight: .bold))
                .foregroundStyle(LinearGradient.primaryGradient)
            
            // Subtitle
            Text("Stay organized, stay productive")
                .font(.system(size: 16))
                .foregroundStyle(Color.subtitleGray)
        }
        .padding(.top, 16)
    }
    
    @ViewBuilder
    private var syncStatusView: some View {
        switch syncState {
        case .idle:
            EmptyView()
        case .syncing:
            HStack(spacing: 6) {
                ProgressView()
                    .scaleEffect(0.7)
                Text("Syncing...")
                    .font(.caption)
                    .foregroundStyle(Color.subtitleGray)
            }
        case .success(let date):
            HStack(spacing: 4) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.green)
                Text("Synced \(date.formatted(.relative(presentation: .named)))")
                    .font(.caption)
                    .foregroundStyle(Color.subtitleGray)
            }
        case .error(let message):
            HStack(spacing: 4) {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .lineLimit(1)
            }
        }
    }
}

#Preview {
    ZStack {
        GradientBackground()
        VStack(spacing: 40) {
            HeaderView(onSignOut: {}, syncState: .idle)
            HeaderView(onSignOut: {}, syncState: .syncing)
            HeaderView(onSignOut: {}, syncState: .success(Date()))
            HeaderView(onSignOut: {}, syncState: .error("Network error"))
        }
    }
}

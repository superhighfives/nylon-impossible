//
//  EmptyStateView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI

struct EmptyStateView: View {
    @State private var appeared = false

    var body: some View {
        VStack(spacing: 4) {
            Spacer()

            Image(systemName: "tray")
                .font(.system(size: 20))
                .foregroundStyle(Color.appSubtle)
                .frame(width: 48, height: 48)
                .background(Color.appTint, in: Circle())
                .padding(.bottom, 12)

            Text("Nothing to do yet")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Color.appDefault)

            Text("Add a todo below to get started. Try “Buy groceries tomorrow” or paste a link to research.")
                .font(.system(size: 13))
                .foregroundStyle(Color.appSubtle)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 280)

            Spacer()
        }
        .frame(maxWidth: .infinity)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(.easeIn(duration: 0.4)) {
                appeared = true
            }
        }
    }
}

#Preview {
    ZStack {
        GradientBackground()
        EmptyStateView()
    }
}

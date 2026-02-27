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
        VStack(spacing: 8) {
            Spacer()

            Image(systemName: "checklist")
                .font(.system(size: 48))
                .foregroundStyle(Color.kumoLine)
                .padding(.bottom, 16)

            Text("No tasks yet")
                .font(.system(size: 18))
                .foregroundStyle(Color.kumoSubtle)

            Text("Add a task to get started")
                .font(.system(size: 14))
                .foregroundStyle(Color.kumoInactive)

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

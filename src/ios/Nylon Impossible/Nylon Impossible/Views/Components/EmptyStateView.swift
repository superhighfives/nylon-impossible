//
//  EmptyStateView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI

struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 8) {
            Spacer()

            // Empty circle icon
            Circle()
                .stroke(Color.kumoLine, lineWidth: 3)
                .frame(width: 64, height: 64)
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
    }
}

#Preview {
    ZStack {
        GradientBackground()
        EmptyStateView()
    }
}

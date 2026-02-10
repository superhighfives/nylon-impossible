//
//  HeaderView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI

struct HeaderView: View {
    var body: some View {
        VStack(spacing: 16) {
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
        .padding(.top, 32)
    }
}

#Preview {
    ZStack {
        GradientBackground()
        HeaderView()
    }
}

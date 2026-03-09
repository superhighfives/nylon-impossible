//
//  DebugBannerView.swift
//  Nylon Impossible
//

import SwiftUI

struct DebugBannerView: View {
    var body: some View {
        HStack(spacing: 4) {
            Text("api")
                .foregroundStyle(Color.appSubtle)
            Text(Config.apiBaseURL.absoluteString)
                .foregroundStyle(Color.appStrong)
        }
        .font(.system(size: 11, design: .monospaced))
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(.ultraThinMaterial, in: Capsule())
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#Preview {
    ZStack {
        GradientBackground()
        DebugBannerView()
            .padding()
    }
}

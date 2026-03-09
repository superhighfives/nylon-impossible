//
//  DebugBannerView.swift
//  Nylon Impossible
//

import SwiftUI

struct DebugBannerView: View {
    private var environmentLabel: String {
        #if targetEnvironment(simulator)
        return "simulator"
        #else
        return "device"
        #endif
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Text("env")
                    .foregroundStyle(Color.appSubtle)
                Text(environmentLabel)
                    .foregroundStyle(Color.appStrong)
            }
            HStack(spacing: 4) {
                Text("api")
                    .foregroundStyle(Color.appSubtle)
                Text(Config.apiBaseURL.absoluteString)
                    .foregroundStyle(Color.appStrong)
            }
        }
        .font(.system(size: 11, design: .monospaced))
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
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

//
//  FaviconImage.swift
//  Nylon Impossible
//
//  Created by Claude on 3/22/26.
//

import SwiftUI

/// Displays a favicon with cascade fallback: tries the stored URL first, then Google's service.
struct FaviconImage: View {
    let primaryURL: URL?
    let fallbackURL: URL?

    var body: some View {
        if let primaryURL {
            AsyncImage(url: primaryURL) { phase in
                switch phase {
                case .success(let image):
                    image
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                case .failure:
                    // Stored favicon failed — fall back to Google's service
                    AsyncImage(url: fallbackURL) { image in
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                    } placeholder: {
                        Image(systemName: "link")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                    }
                default:
                    Image(systemName: "link")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                }
            }
        } else {
            AsyncImage(url: fallbackURL) { image in
                image
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            } placeholder: {
                Image(systemName: "link")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

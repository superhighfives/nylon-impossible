//
//  SignInView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 2/20/26.
//

import SwiftUI
import ClerkKit
import ClerkKitUI

struct SignInView: View {
    @State private var authIsPresented = false

    var body: some View {
        ZStack {
            GradientBackground()

            VStack(spacing: 32) {
                Spacer()

                // Logo/Header
                VStack(spacing: 8) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 24)
                            .fill(Color.appBrand)
                            .frame(width: 80, height: 80)

                        Image(systemName: "checkmark")
                            .font(.system(size: 36, weight: .bold))
                            .foregroundStyle(.white)
                    }

                    Text("Nylon Impossible")
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundStyle(Color.appDefault)

                    Text("Sign in to sync your todos")
                        .font(.subheadline)
                        .foregroundStyle(Color.appStrong)
                }

                Spacer()

                // Sign in button
                Button {
                    authIsPresented = true
                } label: {
                    Text("Sign In")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.appBrand)
                        .foregroundStyle(.white)
                        .fontWeight(.semibold)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .padding(.horizontal)
                .padding(.bottom, 48)
            }
        }
        .prefetchClerkImages()
        .sheet(isPresented: $authIsPresented) {
            AuthView()
        }
    }
}

#Preview {
    SignInView()
        .environment(Clerk.shared)
}

//
//  SignInView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 2/20/26.
//

import ClerkKit
#if os(iOS)
import ClerkKitUI
#endif
import SwiftUI

/// The signed-out screen. On iOS "Sign in" opens Clerk's `AuthView`; ClerkKitUI
/// doesn't exist on macOS, so there it opens `MacSignInView`.
struct SignInView: View {
    @State private var authIsPresented = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Image("Logo")
                .resizable()
                .scaledToFit()
                .frame(width: 22, height: 22)
                // The mark always sits on yellow, so it keeps its dark form.
                .environment(\.colorScheme, .light)
                .frame(width: 44, height: 44)
                .background(Theme.Colors.brand, in: Circle())
                .accessibilityHidden(true)
                .padding(.top, Theme.Space.s12)

            Spacer()

            Text("Nylon")
                .textStyle(Theme.Fonts.Role.masthead, tracking: Theme.Tracking.masthead)
                .foregroundStyle(Theme.Colors.ink)
                .accessibilityAddTraits(.isHeader)
            Text("Today, This week, Someday. Todos that age on their own.")
                .textStyle(Theme.Fonts.Role.body)
                .foregroundStyle(Theme.Colors.inkMuted)
                .padding(.top, Theme.Space.s3)
            Hairline().padding(.vertical, Theme.Space.s6)

            Button {
                authIsPresented = true
            } label: {
                Text("Sign in")
                    .textStyle(Theme.Fonts.Role.body)
                    .fontWeight(.semibold)
                    .foregroundStyle(Theme.Colors.brandInk)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(Theme.Colors.brand, in: RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.bottom, Theme.Space.s6)
        }
        .padding(.horizontal, Theme.Phone.gutter)
        #if os(macOS)
        .frame(maxWidth: 420)
        #endif
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(Theme.Colors.canvas.ignoresSafeArea())
        #if os(iOS)
        .prefetchClerkImages()
        .sheet(isPresented: $authIsPresented) {
            AuthView()
        }
        #else
        .sheet(isPresented: $authIsPresented) {
            MacSignInView { authIsPresented = false }
        }
        #endif
    }
}

#Preview {
    SignInView()
        .environment(Clerk.shared)
}

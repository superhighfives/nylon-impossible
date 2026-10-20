//
//  SignInView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 2/20/26.
//

import ClerkKit
import ClerkKitUI
import SwiftUI

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
            Text("Today, This Week, Someday. Todos that age on their own.")
                .textStyle(Theme.Fonts.Role.body)
                .foregroundStyle(Theme.Colors.inkMuted)
                .padding(.top, Theme.Space.s3)
            Hairline().padding(.vertical, Theme.Space.s6)

            Button {
                authIsPresented = true
            } label: {
                Text("Sign in")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Theme.Colors.brandInk)
                    .frame(maxWidth: .infinity, minHeight: 52)
                    .background(Theme.Colors.brand, in: RoundedRectangle(cornerRadius: Theme.Radius.field, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.bottom, Theme.Space.s6)
        }
        .padding(.horizontal, Theme.Phone.gutter)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(Theme.Colors.canvas.ignoresSafeArea())
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

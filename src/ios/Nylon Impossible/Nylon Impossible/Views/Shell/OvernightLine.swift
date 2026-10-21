//
//  OvernightLine.swift
//  Nylon Impossible
//
//  The single quiet line Today shows the morning after the sweep moved
//  something: "2 moved to This Week, 1 to Someday overnight", with a moon and
//  a dismiss ×. `OvernightNote` decides when; this only draws it.
//

import SwiftUI

struct OvernightLine: View {
    let text: String
    var gutter: CGFloat = Theme.Phone.gutter
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: Theme.Space.s2) {
            Image(systemName: Theme.Icon.themeDark)
                .imageScale(.small)
                .accessibilityHidden(true)
            Text(text)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: onDismiss) {
                Image(systemName: Theme.Icon.close)
                    .font(.system(size: 11, weight: .bold))
                    .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(.trailing, -14)
            .accessibilityLabel("Dismiss")
        }
        .textStyle(Theme.Fonts.Role.meta)
        .foregroundStyle(Theme.Colors.inkMuted)
        .padding(.horizontal, gutter)
        .padding(.top, Theme.Space.s1)
        .frame(minHeight: Theme.Space.rowMinHeight)
        .accessibilityElement(children: .contain)
    }
}

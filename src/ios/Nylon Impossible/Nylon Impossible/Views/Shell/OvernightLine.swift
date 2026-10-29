//
//  OvernightLine.swift
//  Nylon Impossible
//
//  The note Today shows the morning after the sweep moved something: "2
//  moved to This week", with a moon and a dismiss ×, as a small orange pill.
//  `OvernightNote` decides when; this only draws it.
//

import SwiftUI

/// The overnight note as a small orange pill, above Today's title in the
/// space every board column header and top-level phone page keeps for it (so
/// titles don't move when it comes or goes). Its text goes to the list they
/// moved to; × dismisses it. Up to two lines, then truncated.
struct OvernightPill: View {
    let text: String
    let onSee: () -> Void
    let onDismiss: () -> Void

    @Environment(\.isWideLayout) private var isWide

    /// "2 moved to This week": the moon says when.
    private var shortText: String {
        text.hasSuffix(" overnight") ? String(text.dropLast(" overnight".count)) : text
    }

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: Theme.Icon.themeDark)
                .font(.system(size: 12, weight: .semibold))
                .accessibilityHidden(true)
            Button(action: onSee) {
                Text(shortText)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .accessibilityHint(isWide ? "Selects the first of them" : "Shows them")
            Button(action: onDismiss) {
                Image(systemName: Theme.Icon.close)
                    .font(.system(size: 11, weight: .bold))
                    .frame(width: 26, height: 26)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Dismiss overnight note")
        }
        .textStyle(Theme.Fonts.Role.meta)
        .fontWeight(.medium)
        .foregroundStyle(Theme.Colors.notice)
        .padding(.leading, 10)
        .padding(.trailing, 2)
        .padding(.vertical, 4)
        .background(Theme.Colors.noticeFill, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.updatesFrequently)
    }
}

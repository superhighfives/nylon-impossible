//
//  OvernightLine.swift
//  Nylon Impossible
//
//  The single quiet line Today shows the morning after the sweep moved
//  something: "2 moved to This week, 1 to Someday overnight", with a moon and
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

/// The overnight note as a small orange pill, above Today's title on the
/// board, in the space every column header keeps for it (so titles don't
/// move when it comes or goes). Its text selects the first todo in the list
/// they moved to; × dismisses it. Up to two lines, then truncated.
struct OvernightPill: View {
    let text: String
    let onSee: () -> Void
    let onDismiss: () -> Void

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
            .accessibilityHint("Selects the first of them")
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

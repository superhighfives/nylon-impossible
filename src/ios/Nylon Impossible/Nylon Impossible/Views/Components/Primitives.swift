//
//  Primitives.swift
//  Nylon Impossible
//
//  The small pieces every screen is built from: the hairline, the checkbox,
//  chips, section labels and quiet buttons. The main screen, the detail sheet,
//  Settings and the share extension all use these, so none of them falls back
//  to stock `Form` styling.
//

import SwiftUI

/// A 1pt rule (the web's 1px) — the only separator the design uses.
struct Hairline: View {
    var body: some View {
        Rectangle()
            .fill(Theme.Colors.hairline)
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}

/// The rounded-square checkbox. Empty: an ink outline. Checked: a yellow
/// fill with a dark check. The 44pt target sits around the drawn box.
struct Checkbox: View {
    let isChecked: Bool
    var size: CGFloat = Theme.Phone.checkbox
    /// Done history draws its checks greyed, as restorable rather than live.
    var isMuted = false
    let label: String
    let action: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Grows the box with Dynamic Type so it isn't a speck beside an AX5
    /// title. Capped: past this it only crowds the title.
    @ScaledMetric(relativeTo: .body) private var scale: CGFloat = 1

    /// The drawn box at the current text size.
    private var drawn: CGFloat { size * min(max(scale, 1), 1.6) }

    private var radius: CGFloat { drawn * 7 / 24 }

    @State private var popped = false

    var body: some View {
        // The target stays 10pt clear of the box on each side, which is what
        // the rows' negative padding assumes, and is never under 44pt.
        let target = max(Theme.Space.rowMinHeight, drawn + 20)
        Button(action: action) {
            box
                .frame(width: target, height: target)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isChecked ? .isSelected : [])
        .onChange(of: isChecked) { _, checked in
            // The box pops as it fills (the prototype's 240ms `pop`).
            guard checked, !reduceMotion, !isMuted else { return }
            withAnimation(.easeOut(duration: 0.1)) {
                popped = true
            } completion: {
                withAnimation(Theme.Motion.easeOutStrong(0.14)) { popped = false }
            }
        }
    }

    private var box: some View {
        ZStack {
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .strokeBorder(isChecked ? Color.clear : Theme.Colors.ink, lineWidth: drawn > 20 ? 1.75 : 1.5)
            RoundedRectangle(cornerRadius: radius, style: .continuous)
                .fill(isMuted ? Theme.Colors.fill : Theme.Colors.brand)
                .opacity(isChecked ? 1 : 0)
            Image(systemName: Theme.Icon.done)
                .font(.system(size: drawn * 0.55, weight: .heavy))
                .foregroundStyle(isMuted ? Theme.Colors.inkMuted : Theme.Colors.brandInk)
                .opacity(isChecked ? 1 : 0)
                .scaleEffect(isChecked || reduceMotion ? 1 : 0.4)
        }
        .frame(width: drawn, height: drawn)
        .scaleEffect(popped ? 1.18 : 1)
        .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: isChecked)
    }
}

/// A chip: outlined and muted when off, filled when on. `strong` fills with
/// the brand yellow (a choice the chip *makes*, like the composer's target);
/// otherwise the soft fill (a property that's set, like Pinned).
struct ChipLabel: View {
    let text: String
    var systemImage: String?
    var isOn = false
    var strong = false
    var tint: Color?
    /// A trailing ▾, for a chip that opens a menu.
    var opensMenu = false

    private var background: Color {
        guard isOn else { return .clear }
        return strong ? Theme.Colors.brand : Theme.Colors.fill
    }

    private var foreground: Color {
        if let tint { return tint }
        guard isOn else { return Theme.Colors.inkMuted }
        return strong ? Theme.Colors.brandInk : Theme.Colors.ink
    }

    var body: some View {
        HStack(spacing: 6) {
            if let systemImage {
                Image(systemName: systemImage)
                    .imageScale(.small)
                    .accessibilityHidden(true)
            }
            Text(text)
                .lineLimit(1)
            if opensMenu {
                Image(systemName: Theme.Icon.chevronDown)
                    .font(.system(size: 10, weight: .bold))
                    .opacity(0.7)
                    .accessibilityHidden(true)
            }
        }
        .textStyle(Theme.Fonts.Role.chip)
        .foregroundStyle(foreground)
        .padding(.horizontal, Theme.Space.s3)
        .frame(minHeight: 32)
        .background(background, in: RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous)
                .strokeBorder(isOn ? background : Theme.Colors.hairline, lineWidth: 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous))
        .animation(Theme.Motion.easeOutStrong(Theme.Motion.fast), value: isOn)
    }
}

struct ChipButton: View {
    let text: String
    var systemImage: String?
    var isOn = false
    var strong = false
    var tint: Color?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ChipLabel(text: text, systemImage: systemImage, isOn: isOn, strong: strong, tint: tint)
                .frame(minHeight: Theme.Space.rowMinHeight)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? .isSelected : [])
    }
}

/// "Notes", "Subtasks 1/4" — the small muted label over a sheet section.
struct SectionLabel: View {
    let text: String
    var detail: String?

    var body: some View {
        HStack(spacing: 4) {
            Text(text)
            if let detail {
                Text(detail).fontWeight(.medium)
            }
        }
        .textStyle(Theme.Fonts.Role.label)
        .foregroundStyle(Theme.Colors.inkMuted)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
    }
}

/// The 30pt circle in the switcher and the account sheet: the Clerk avatar
/// when there is one, initials otherwise.
struct AvatarView: View {
    let imageURL: URL?
    let initials: String
    var size: CGFloat = Theme.Phone.avatar

    var body: some View {
        ZStack {
            Circle().fill(Theme.Colors.fill)
            Text(initials)
                .font(.system(size: size * 0.4, weight: .semibold))
                .foregroundStyle(Theme.Colors.ink)
            if let imageURL {
                AsyncImage(url: imageURL) { image in
                    image.resizable().scaledToFill()
                } placeholder: {
                    Color.clear
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }
}

/// A row that reads as a plain line of text with a trailing detail and an
/// optional chevron — the account sheet and Settings are built from these.
struct PlainRow<Trailing: View>: View {
    let title: String
    var tint: Color = Theme.Colors.ink
    @ViewBuilder var trailing: () -> Trailing

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        Group {
            // At accessibility sizes the detail goes under the title, so
            // neither breaks mid-word or truncates.
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: Theme.Space.s1) {
                    titleText
                    HStack(spacing: Theme.Space.s3) { trailing() }
                }
                .padding(.vertical, Theme.Space.s3)
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(spacing: Theme.Space.s3) {
                    titleText
                    Spacer(minLength: Theme.Space.s2)
                    trailing()
                }
            }
        }
        .frame(minHeight: 52)
        .contentShape(Rectangle())
    }

    private var titleText: some View {
        Text(title)
            .textStyle(Theme.Fonts.Role.body)
            .foregroundStyle(tint)
    }
}

extension PlainRow where Trailing == EmptyView {
    init(title: String, tint: Color = Theme.Colors.ink) {
        self.init(title: title, tint: tint) { EmptyView() }
    }
}

/// The trailing chevron for a row that pushes.
struct Chevron: View {
    var body: some View {
        Image(systemName: Theme.Icon.chevronRight)
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Theme.Colors.inkSubtle)
            .accessibilityHidden(true)
    }
}

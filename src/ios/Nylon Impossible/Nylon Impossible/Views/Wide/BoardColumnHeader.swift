//
//  BoardColumnHeader.swift
//  Nylon Impossible
//
//  A board column's title and subline, in a header of fixed (Dynamic
//  Type–scaled) height so every column's title sits on the same baseline.
//  Your lists' titles rename in place: tap the title (or Rename in the ⋯
//  menu), Return or leaving the field saves, Esc cancels. Done's title is
//  muted, like a subline: it's the fourth column's resting state.
//

import SwiftUI

struct BoardColumnHeader<Accessory: View>: View {
    let title: String
    let subline: String
    var isMuted = false
    /// Your list's column: the title is a button that renames in place.
    var onRename: ((String) -> Void)?
    /// Set from outside too, by Rename in the ⋯ menu.
    @Binding var isRenaming: Bool
    /// Today's overnight pill. Every header keeps its space (two lines,
    /// 20pt clear of the title) whether or not it's showing.
    var banner: AnyView?
    /// The top-trailing corner: ⋯ and × on your list's column.
    @ViewBuilder var accessory: () -> Accessory

    @ScaledMetric(relativeTo: .largeTitle) private var headerHeight = Theme.Wide.columnHeader + 44
    /// Two lines of the pill's text.
    @ScaledMetric(relativeTo: .footnote) private var bannerHeight: CGFloat = 44
    @State private var draft = ""
    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 0)
            VStack(alignment: .leading, spacing: 0) {
                Spacer(minLength: 0)
                banner
            }
            .frame(height: bannerHeight, alignment: .bottomLeading)
            .padding(.bottom, 20)
            titleView
            Text(subline)
                .textStyle(Theme.Fonts.Role.meta)
                .foregroundStyle(Theme.Colors.inkMuted)
                .lineLimit(2)
                .padding(.top, 10)
        }
        .frame(maxWidth: .infinity, minHeight: headerHeight, maxHeight: headerHeight, alignment: .bottomLeading)
        .overlay(alignment: .topTrailing) {
            HStack(spacing: 0) { accessory() }
                .padding(.top, Theme.Space.s3)
                .padding(.trailing, -Theme.Space.s3)
        }
        .padding(.horizontal, Theme.Wide.gutter)
        .padding(.bottom, 18)
        .onChange(of: isRenaming) { _, renaming in
            guard renaming else { return }
            draft = title
            fieldFocused = true
        }
    }

    @ViewBuilder
    private var titleView: some View {
        if isRenaming, onRename != nil {
            TextField("List name", text: $draft)
                .textStyle(Theme.Fonts.Role.columnTitle, tracking: Theme.Tracking.masthead)
                .foregroundStyle(Theme.Colors.ink)
                .textFieldStyle(.plain)
                .focused($fieldFocused)
                .submitLabel(.done)
                .onSubmit { finish(save: true) }
                .onKeyPress(.escape) {
                    finish(save: false)
                    return .handled
                }
                .onChange(of: fieldFocused) { _, focused in
                    if !focused, isRenaming { finish(save: true) }
                }
                .background(
                    RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous)
                        .fill(Theme.Colors.fill)
                        .padding(.horizontal, -4)
                )
                .accessibilityLabel("List name")
        } else if onRename != nil {
            Button { isRenaming = true } label: { titleText }
                .buttonStyle(.plain)
                .accessibilityHint("Renames the list")
        } else {
            titleText
        }
    }

    private var titleText: some View {
        Text(title)
            .textStyle(Theme.Fonts.Role.columnTitle, tracking: Theme.Tracking.masthead)
            .foregroundStyle(isMuted ? Theme.Colors.inkMuted : Theme.Colors.ink)
            // Wraps at large sizes in a narrow column rather than clipping
            // "This week"; the controls sit in the corner, not beside it.
            .lineLimit(2)
            .minimumScaleFactor(0.7)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityAddTraits(.isHeader)
    }

    private func finish(save: Bool) {
        let name = draft.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        isRenaming = false
        fieldFocused = false
        if save, !name.isEmpty, name != title { onRename?(name) }
    }
}

extension BoardColumnHeader where Accessory == EmptyView {
    init(title: String, subline: String, isMuted: Bool = false) {
        self.init(title: title, subline: subline, isMuted: isMuted, onRename: nil, isRenaming: .constant(false), banner: nil) {
            EmptyView()
        }
    }
}

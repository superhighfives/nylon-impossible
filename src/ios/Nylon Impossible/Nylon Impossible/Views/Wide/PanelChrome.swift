//
//  PanelChrome.swift
//  Nylon Impossible
//
//  Small pieces of the iPad board's frame: the vertical hairline between
//  sidebar, columns and panel, the hatch past the last column, and the close
//  button around Done and Settings in the trailing panel.
//

import SwiftUI

/// A 1pt vertical rule between the sidebar and the columns.
struct VerticalHairline: View {
    var body: some View {
        Rectangle()
            .fill(Theme.Colors.hairline)
            .frame(width: 1)
            .frame(maxHeight: .infinity)
            .ignoresSafeArea()
            .accessibilityHidden(true)
    }
}

/// What's left of the board past its last column: `hairline` lines at the
/// board tokens' angle, width and spacing, as the web draws them. Nothing in
/// it to click or read.
struct BoardHatch: View {
    var body: some View {
        Canvas { context, size in
            // Lines run across the gradient's direction, CSS-style: at 45°,
            // from top left to bottom right.
            let reach = (size.width * size.width + size.height * size.height).squareRoot()
            context.translateBy(x: size.width / 2, y: size.height / 2)
            context.rotate(by: .degrees(Theme.Board.hatchAngle))
            var lines = Path()
            var y = -reach / 2
            while y < reach / 2 {
                lines.addRect(CGRect(x: -reach / 2, y: y, width: reach, height: Theme.Board.hatchWidth))
                y += Theme.Board.hatchSpacing
            }
            context.fill(lines, with: .color(Theme.Colors.hairline))
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Done and Settings in the trailing panel, with the detail's close button.
struct PanelChrome<Content: View>: View {
    let onClose: () -> Void
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .overlay(alignment: .topTrailing) {
                Button(action: onClose) {
                    Image(systemName: Theme.Icon.close)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Theme.Colors.inkMuted)
                        .frame(width: 30, height: 30)
                        .background(Theme.Colors.fill, in: Circle())
                        .frame(width: Theme.Space.rowMinHeight, height: Theme.Space.rowMinHeight)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .padding(.top, Theme.Space.s3)
                .padding(.trailing, Theme.Space.s3)
                .accessibilityLabel("Close")
            }
            .background(Theme.Colors.canvas)
    }
}

/// A todo's detail in the board's fourth column, or (on iPad, in a sheet)
/// Settings. Takes plain values rather than reading the board's
/// queries itself (see `ContentRoot`).
struct WidePanel: View {
    let todo: TodoItem?
    let route: AccountRoute?
    let lists: [TodoListModel]
    let actions: TodoActions
    let apiService: APIService?
    let userId: String?
    let showsCalendar: Bool
    let onClose: () -> Void
    /// See `TodoDetailSheet.focusTitle` and `onEditingChange`.
    var focusTitle: Binding<Bool> = .constant(false)
    var onEditingChange: ((Bool) -> Void)?

    var body: some View {
        if let todo {
            TodoDetailSheet(
                todo: todo,
                actions: actions,
                lists: lists,
                apiService: apiService,
                userId: userId,
                showsCalendar: showsCalendar,
                onClose: onClose,
                focusTitle: focusTitle,
                onEditingChange: onEditingChange
            )
            .id("\(todo.id)-\(showsCalendar)")
            .unbezeledControls()
        } else if let route {
            PanelChrome(onClose: onClose) {
                switch route {
                case .settings: SettingsView()
                }
            }
        }
    }
}

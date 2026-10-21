//
//  WidgetGallery.swift
//  Nylon Impossible
//
//  DEBUG only: the Today widget's real views, drawn in the app at iPhone
//  widget sizes from the screenshot route's sample data
//  (`-NylonScreen widgets`). Nothing can place a widget on a simulator's Home
//  Screen from a script, so this is how the widget gets a screenshot.
//

#if DEBUG
import SwiftData
import SwiftUI
import WidgetKit

struct WidgetGallery: View {
    let container: ModelContainer

    private var entry: TodayEntry {
        let todos = TodayDigest.fetch(userId: "sample-user", context: container.mainContext)
        return TodayEntry.make(from: todos)
    }

    var body: some View {
        #if os(macOS)
        mac
        #else
        phone
        #endif
    }

    #if os(macOS)
    /// The desktop and Notification Center sizes on a Mac: small and medium
    /// side by side, large below, each with the system's content margins.
    private var mac: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Space.s4) {
                label("Small · Medium · Large (Mac desktop)")
                HStack(alignment: .top, spacing: Theme.Space.s4) {
                    home(.systemSmall, width: 170, height: 170)
                    home(.systemSmall, entry: TodayEntry(date: .now, content: .todos([], total: 0)), width: 170, height: 170)
                    home(.systemMedium, width: 364, height: 170)
                }
                home(.systemLarge, width: 364, height: 382)
            }
            .padding(Theme.Space.s6)
        }
        .background(Theme.Colors.fill.ignoresSafeArea())
    }
    #endif

    private var phone: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.Space.s4) {
                label("Small · Medium")
                HStack(alignment: .top, spacing: Theme.Space.s4) {
                    home(.systemSmall, width: 170)
                    home(.systemSmall, entry: TodayEntry(date: .now, content: .todos([], total: 0)), width: 170)
                }
                home(.systemMedium, width: 364)

                #if os(iOS)
                label("Lock Screen")
                VStack(alignment: .leading, spacing: Theme.Space.s3) {
                    TodayWidgetView(entry: entry, family: .accessoryInline)
                        .font(.system(size: 15, weight: .semibold))
                    HStack(spacing: Theme.Space.s3) {
                        TodayWidgetView(entry: entry, family: .accessoryCircular)
                            .frame(width: 76, height: 76)
                        TodayWidgetView(entry: entry, family: .accessoryRectangular)
                            .frame(width: 172, height: 76)
                    }
                }
                .padding(Theme.Space.s4)
                .foregroundStyle(.white)
                .environment(\.colorScheme, .dark)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    LinearGradient(colors: [Color(white: 0.28), Color(white: 0.12)], startPoint: .top, endPoint: .bottom),
                    in: RoundedRectangle(cornerRadius: 22, style: .continuous)
                )
                #endif
            }
            .padding(Theme.Space.s4)
        }
        .background(Theme.Colors.fill.ignoresSafeArea())
    }

    private func label(_ text: String) -> some View {
        Text(text)
            .textStyle(Theme.Fonts.Role.label)
            .foregroundStyle(Theme.Colors.inkMuted)
    }

    /// A Home Screen widget at its iPhone size: the system's 16pt content
    /// margins and corner radius around the widget's own view.
    private func home(_ family: WidgetFamily, entry: TodayEntry? = nil, width: CGFloat, height: CGFloat = 170) -> some View {
        TodayWidgetView(entry: entry ?? self.entry, family: family)
            .padding(16)
            .frame(width: width, height: height)
            .background(Theme.Colors.canvas, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
#endif

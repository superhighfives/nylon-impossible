//
//  DueChipView.swift
//  Nylon Impossible
//
//  "Due Fri ×" — the date the add bar parsed out of the typed text. × keeps
//  the words in the title. Minimal on purpose; Phase 3's composer replaces it.
//

import SwiftUI

struct DueChipView: View {
    let dueDay: Date
    var onDismiss: () -> Void

    var body: some View {
        let label = Self.label(for: dueDay)
        HStack(spacing: 4) {
            Text("Due \(label)")
                .font(.footnote.weight(.medium))
                .foregroundStyle(Color.appDefault)
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Keep \(label) in the title")
        }
        .padding(.leading, 10)
        .padding(.trailing, 2)
        .padding(.vertical, 2)
        .glassEffect(.regular, in: .rect(cornerRadius: 6))
    }

    /// "Today", "Tomorrow", a weekday within the week ("Fri"), else "Oct 30".
    static func label(for dueDay: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        let day = DueDay.localDate(dueDay, calendar: calendar)
        let today = calendar.startOfDay(for: now)
        let diff = calendar.dateComponents([.day], from: today, to: day).day ?? 0
        if diff == 0 { return "Today" }
        if diff == 1 { return "Tomorrow" }
        if diff > 1 && diff < 7 { return day.formatted(.dateTime.weekday(.abbreviated)) }
        return day.formatted(.dateTime.month(.abbreviated).day())
    }
}

#Preview {
    DueChipView(dueDay: DueDay.fromLocal(Date().addingTimeInterval(86_400 * 3))) {}
        .padding()
}

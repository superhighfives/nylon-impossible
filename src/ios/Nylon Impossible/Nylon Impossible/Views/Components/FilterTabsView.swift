//
//  FilterTabsView.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 1/16/26.
//

import SwiftUI

struct FilterTabsView: View {
    @Binding var selectedFilter: TodoFilter
    @Namespace private var animation

    var body: some View {
        HStack(spacing: 8) {
            ForEach(TodoFilter.allCases, id: \.self) { filter in
                FilterButton(
                    title: filter.rawValue,
                    isSelected: selectedFilter == filter,
                    namespace: animation
                ) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        selectedFilter = filter
                    }
                }
            }
        }
        .padding(6)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.kumoElevated)
                .stroke(Color.kumoLine, lineWidth: 0.5)
        )
    }
}

struct FilterButton: View {
    let title: String
    let isSelected: Bool
    var namespace: Namespace.ID
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14, weight: isSelected ? .semibold : .medium))
                .foregroundStyle(isSelected ? Color(.systemBackground) : Color.kumoStrong)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background {
                    if isSelected {
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color.kumoDefault)
                            .matchedGeometryEffect(id: "selectedTab", in: namespace)
                    }
                }
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    ZStack {
        GradientBackground()
        FilterTabsView(selectedFilter: .constant(.all))
            .padding()
    }
}

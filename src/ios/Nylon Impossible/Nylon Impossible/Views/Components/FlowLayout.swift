//
//  FlowLayout.swift
//  Nylon Impossible
//
//  Created by Charlie Gleason on 3/13/26.
//

import SwiftUI

/// A layout that arranges views in a flowing, wrapping manner (like flexbox wrap)
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = calculateLayout(proposal: proposal, subviews: subviews)
        return result.size
    }
    
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = calculateLayout(proposal: proposal, subviews: subviews)
        let maxWidth = proposal.width ?? .infinity
        let constrainedProposal = maxWidth < .infinity
            ? ProposedViewSize(width: maxWidth, height: nil)
            : .unspecified

        for (index, position) in result.positions.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y),
                proposal: constrainedProposal
            )
        }
    }
    
    private func calculateLayout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var rowHeight: CGFloat = 0
        var totalHeight: CGFloat = 0
        var maxRowWidth: CGFloat = 0

        for subview in subviews {
            // Constrain each chip to the available width so long text truncates
            // rather than overflowing the container
            let constrainedProposal = maxWidth < .infinity
                ? ProposedViewSize(width: maxWidth, height: nil)
                : .unspecified
            let size = subview.sizeThatFits(constrainedProposal)
            
            // Check if we need to wrap to next row
            if currentX + size.width > maxWidth && currentX > 0 {
                currentX = 0
                currentY += rowHeight + spacing
                rowHeight = 0
            }
            
            positions.append(CGPoint(x: currentX, y: currentY))
            
            rowHeight = max(rowHeight, size.height)
            currentX += size.width + spacing
            maxRowWidth = max(maxRowWidth, currentX - spacing)
        }
        
        totalHeight = currentY + rowHeight
        
        return (CGSize(width: maxRowWidth, height: totalHeight), positions)
    }
}

#Preview {
    FlowLayout(spacing: 8) {
        ForEach(0..<5) { i in
            Text("Item \(i)")
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.gray.opacity(0.2))
                .cornerRadius(4)
        }
    }
    .frame(width: 200)
    .padding()
}

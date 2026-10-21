//
//  NylonWidgetBundle.swift
//  Nylon Widget
//
//  Created by Claude on 8/27/26.
//

import SwiftUI
import WidgetKit

@main
struct NylonWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        // Control Center controls are iOS-only here: the Mac has the menu
        // bar extra and the global hotkey for the same job.
        #if os(iOS)
        AddTodoControl()
        #endif
    }
}

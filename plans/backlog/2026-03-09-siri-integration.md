# Siri Integration

Adding items to Nylon Impossible via Siri doesn't work, despite the share sheet working correctly.

## Problem

When asking Siri to add an item to Nylon Impossible, nothing happens (or Siri doesn't recognise the app as a valid target). The share sheet extension works fine, suggesting the app is partially set up for external input but is missing the Siri/Shortcuts integration.

## Expected Behavior

- Users can say "Hey Siri, add [task] to Nylon Impossible" and have it create a todo
- Nylon Impossible appears as a target app in Siri suggestions for task creation

## Areas to Consider

- Does the app have the Siri entitlement (`NSSiriUsageDescription` in Info.plist, `com.apple.developer.siri` entitlement)?
- Is there an `INAddTasksIntentHandling` implementation or an App Intent for task creation?
- The share sheet likely uses a Share Extension target — Siri requires a separate integration (App Intents or SiriKit `INAddTasksIntent`)
- Check whether iOS 26's App Intents framework is the right approach vs legacy SiriKit intents
- Investigate what the share sheet extension does and whether the same logic can be wired up to an App Intent

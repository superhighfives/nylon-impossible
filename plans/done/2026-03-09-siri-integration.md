# Siri Integration Fix

Adding items to Nylon via Siri wasn't working despite the share sheet working correctly.

## Problem

When asking Siri to add an item to Nylon, nothing happened. The share sheet extension worked fine, suggesting the app was partially set up for external input but the Siri integration wasn't configured correctly.

## Root Cause

The `AddTaskIntent` existed but was missing proper configuration:
1. No `requestValueDialog` to prompt users for the task text
2. No `openAppWhenRun` setting
3. App display name was "Nylon Impossible" (verbose for voice commands)

## Fix Applied

| File | Change |
|------|--------|
| `Nylon-Impossible-Info.plist` | Added `CFBundleDisplayName` = "Nylon" |
| `AddTaskIntent.swift` | Added `openAppWhenRun = false` and `requestValueDialog` |
| `AppShortcuts.swift` | Cleaned up phrases |

## Result

Users can now say:
- "Hey Siri, add a task to Nylon"
- "Hey Siri, create a task in Nylon"
- "Hey Siri, remind me in Nylon"

Siri prompts "What would you like to add?" and then confirms the task was created.

## Future Enhancement

See `plans/ready/2026-03-13-siri-inline-parameters.md` for enabling direct inline commands like "Add buy milk to Nylon" (requires `AppEntity` wrapper for the task title parameter).

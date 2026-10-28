---
title: Siri Integration Fix
status: Complete
created: 2026-03-09
updated: 2026-10-27
---

## Overview

A follow-up to `plans/done/2026-03-02-siri-integration.md`, which added the
App Intents plumbing for Siri (`AddTaskIntent`, `AppShortcuts`, the shared App
Group container) in #19. That shipped, but asking Siri to add something did
nothing. This plan diagnosed why and fixed the intent's configuration and the
app's spoken name. The fix was committed straight to `main` on 2026-03-13
(`ae7a927`, no PR of its own), just ahead of the inline-parameter work in
`2026-03-13-siri-inline-parameters.md` (#32).

The same commit set `CFBundleDisplayName` to "Nylon", which is why the app has
been called Nylon on the Home Screen ever since.

## Architecture

All changes are in `src/ios/Nylon Impossible/`:

| File | Change |
|------|--------|
| `Nylon-Impossible-Info.plist` | Added `CFBundleDisplayName` = "Nylon" |
| `Nylon Impossible/Intents/AddTaskIntent.swift` | Added `openAppWhenRun = false` and `requestValueDialog: "What would you like to add?"` |
| `Nylon Impossible/Intents/AppShortcuts.swift` | Added "New task in Nylon" alongside the existing phrases |

Renaming the app wasn't enough by itself. Two days later Siri was still
sending "add a task" phrases to Reminders, so `4114b49` (2026-03-15) added
`INAlternativeAppNames` = "Nylon" to the plist and led the phrases with the
app name ("Nylon add …", "Save to Nylon") instead of generic verbs.

The intent has been reworked a lot since: background sync after a Siri add
(`2026-03-18-ios-siri-background-sync.md`), the "todo" wording and an optional
list parameter (#404), and Mac support (#408). The plist keys and
`openAppWhenRun = false` are still there. The prompt now reads "What's the
todo?", and none of the "Result" phrases below survive word for word.


Adding items to Nylon via Siri wasn't working despite the share sheet working correctly.

## Problem

When asking Siri to add an item to Nylon, nothing happened. The share sheet extension worked fine, suggesting the app was partially set up for external input but the Siri integration wasn't configured correctly.

## Root Cause

The `AddTaskIntent` existed but was missing proper configuration:
1. No `requestValueDialog` to prompt users for the task text
2. No `openAppWhenRun` setting
3. App display name was "Nylon Impossible" (verbose for voice commands)

## Result

Users can now say:
- "Hey Siri, add a task to Nylon"
- "Hey Siri, create a task in Nylon"
- "Hey Siri, remind me in Nylon"

Siri prompts "What would you like to add?" and then confirms the task was created.

## Future Enhancement

See `plans/ready/2026-03-13-siri-inline-parameters.md` for enabling direct inline commands like "Add buy milk to Nylon" (requires `AppEntity` wrapper for the task title parameter).

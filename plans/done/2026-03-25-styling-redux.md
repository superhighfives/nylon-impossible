---
title: Styling Redux – 2026-03-25
status: Complete
created: 2026-03-25
updated: 2026-10-27
---

## Overview

A batch of small UI fixes to the todo list and its input on iOS and web,
written as a checklist after using both apps day to day. All of it shipped
in #99 (merged 2026-03-27): a floating, self-hiding input bar on iOS that
grows to four lines, a `+` button that only appears once you type, smaller
grey-ticked completed todos on both platforms, a fix for long URLs pushing
the row's button off screen, and on web a single expand chevron per row
with Delete moved into the expanded panel.

None of this code survives as written. The iOS input was restyled several
times soon after (#126 Liquid Glass, #130 and #133), and the 2026-10
cohesive redesign rebuilt both apps' rows and composers from scratch (#398
for iOS, #397/#401 for web); see `plans/done/2026-10-18-cohesive-redesign.md`.

## Architecture

The main commit was 466cbea, followed by token and lint clean-ups on the
same branch.

- **iOS.** `ContentView.swift` floated `AddTaskInputView` over the list
  with an `.ultraThinMaterial` background and hid it on scroll down via
  `onScrollGeometryChange`. The input used `TextField(axis: .vertical)`
  with `lineLimit(1...4)`, larger padding with the whole area tappable, and
  a spring-animated `+` button. `TodoItemRow` drew completed todos at 13pt
  with a grey checkbox. Long URLs were fixed by capping `UrlRowCompact` at
  220pt with middle truncation and constraining `FlowLayout`, whose
  measure/place mismatch was fixed in a follow-up commit.
- **Web.** `TodoInput.tsx` showed the `+` button bottom-right with extra
  textarea padding underneath it. `TodoList.tsx` replaced Edit and Delete
  with one chevron, and `TodoItemExpanded.tsx` gained Delete next to Save.
  Completed rows used `text-xs` and a new `subtle` variant of `Checkbox`,
  which replaced the `!important` overrides tried first. The branch also
  swapped numbered colour tokens for semantic utilities across the web app.

Deviation: "liquid glass" was first approximated with `.ultraThinMaterial`.
The real iOS 26 `glassEffect` came a week later in #126.

## iOS

- [x] Fix bug where wide URLs push the button out of the frame
- [x] Make completed tasks smaller and make the checkbox a subtle gray
- [x] Only show the + button in the input when the user starts typing
- [x] Make the input textbox grow to fit the text (multiline, up to 4 lines)
- [x] Allow dictation on the input
- [x] Make the hit box for the input bigger (4px on all sides, entire area tappable)
- [x] Move the input to a floating fixed position at the bottom with liquid glass styling — scrolling down hides it, scrolling up brings it back (like Safari)

## Web

- [x] Make completed tasks smaller and make the checkbox a subtle gray
- [x] Add a + button when the user starts typing in the text area (in the bottom-right position), with padding to prevent text overlapping it
- [x] Move delete into the todo item, and just have a single icon (no "edit") that expands and collapses the todo

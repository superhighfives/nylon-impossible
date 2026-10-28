---
title: iOS 26 Location Modernisation
status: Complete
created: 2026-03-28
updated: 2026-10-27
---

**Scope:** iOS

## Overview

**This did not ship.** The plan was to rewrite the iOS Settings location
helper on `CLLocationUpdate.updates` and `MKReverseGeocodingRequest` to clear
a Swift 6 concurrency warning. #124 (merged 2026-04-06) attempted it, but the
branch's last commit reverted `SettingsView.swift` to `main` while chasing a
CI compile failure, so the merge changed nothing. The plan was moved to
`done/` the next day (65f0e23) anyway.

The delegate-and-`CLGeocoder` helper stayed until #386 (2026-10-18) removed
the location setting altogether: the API dropped `users.location`, and iOS
lost the Location section, its CoreLocation helper and the usage string. No
location code remains, so there is nothing left to modernise.

## Architecture

Nothing from this plan is in the codebase. For the record, #124 went through
these steps before it was reverted:

- 1d05560 wrote the `@MainActor` helper the plan sketches. Review
  (e38154f) added kilometre accuracy, an explicit authorisation wait and a
  10-second timeout race.
- The next dozen commits fought compile errors in CI: the failable
  `MKReverseGeocodingRequest` initialiser, `getMapItems` via a continuation,
  task groups swapped for an unstructured `Task`, `first(where:)` swapped
  for a loop, and, on iOS 26, `CLLocationUpdate.Updates` being
  non-throwing, so `try` was dropped.
- c72432a put `CLGeocoder` back to isolate the failure, and 3450878 reverted
  the whole file to see whether `main` itself passed CI. The PR merged at
  that point.

The commits don't say what the root compile failure was, or whether `main`
passed.

## Problem

`LocationHelper` in `SettingsView.swift` (lines 11-73) uses deprecated and callback-heavy
APIs that produce Swift 6 concurrency warnings:

1. **`CLGeocoder.reverseGeocodeLocation(_:completionHandler:)`** — completion-handler API
   superseded by MapKit's `MKReverseGeocodingRequest` which is natively async.
2. **`CLLocationManagerDelegate`** — delegate callbacks (`didUpdateLocations`,
   `locationManagerDidChangeAuthorization`) replaced by the structured-concurrency-friendly
   `CLLocationUpdate.updates` async sequence.
3. **Swift 6 warning** — "reference to captured var 'self' in concurrently-executing code"
   in the `nonisolated` delegate callbacks, caused by closing over mutable state across
   isolation boundaries.

## Proposed solution

Rewrite `LocationHelper` as a `@MainActor`-isolated class (or actor) that uses the modern
async APIs, eliminating delegate callbacks entirely and resolving the Swift 6 warning.

## Implementation sketch

### 1. Replace CLLocationManagerDelegate with CLLocationUpdate.updates

Replace the delegate pattern with the async sequence:

```swift
@MainActor
final class LocationHelper: ObservableObject {
    @Published var isLocating = false

    func request() async -> String? {
        isLocating = true
        defer { isLocating = false }

        // Request authorization
        let manager = CLLocationManager()
        if manager.authorizationStatus == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }

        // Get a single location update
        guard let update = try? await CLLocationUpdate.updates
            .first(where: { $0.location != nil }),
            let location = update.location else {
            return nil
        }

        return await reverseGeocode(location)
    }
}
```

This removes the need for `CLLocationManagerDelegate` conformance, the stored
`onResult` callback, and the `nonisolated` delegate methods that cause the Swift 6 warning.

### 2. Replace CLGeocoder with MKReverseGeocodingRequest

Replace the completion-handler geocoder with MapKit's modern API:

```swift
import MapKit

private func reverseGeocode(_ location: CLLocation) async -> String? {
    let request = MKReverseGeocodingRequest(coordinate: location.coordinate)
    guard let placemarks = try? await request.placemarks,
          let placemark = placemarks.first else {
        return nil
    }
    let parts = [placemark.locality, placemark.administrativeArea ?? placemark.country]
        .compactMap { $0 }
        .filter { !$0.isEmpty }
    let result = parts.joined(separator: ", ")
    return result.isEmpty ? nil : result
}
```

### 3. Update SettingsView call site

The current call site (lines 111-124) uses a callback-based pattern:

```swift
locationHelper.request { result in
    location = result
    UserPreferencesService.shared.setLocation(result)
}
```

Update to use async/await:

```swift
Button {
    Task {
        if let result = await locationHelper.request() {
            location = result
            UserPreferencesService.shared.setLocation(result)
        }
    }
} label: {
    // ...
}
```

## Files to modify

| File | Change |
|------|--------|
| `src/ios/Nylon Impossible/Nylon Impossible/Views/Components/SettingsView.swift` | Rewrite `LocationHelper` with async APIs; update call site |

## Acceptance criteria

- [ ] `CLLocationManagerDelegate` is removed — no delegate callbacks remain
- [ ] Location is obtained via `CLLocationUpdate.updates` async sequence
- [ ] Reverse geocoding uses `MKReverseGeocodingRequest` instead of `CLGeocoder`
- [ ] Swift 6 concurrency warning is resolved (no captured mutable `self` across isolation)
- [ ] `LocationHelper` is `@MainActor`-isolated
- [ ] `import MapKit` is added for `MKReverseGeocodingRequest`
- [ ] Location result format unchanged: `"Locality, Administrative Area"` (or country fallback)
- [ ] Progress indicator still displays while locating
- [ ] Authorization flow still works (prompts on first use, handles denied state)

## Out of scope

- Extracting `LocationHelper` into its own file (single-use, tightly coupled to SettingsView)
- Adding location accuracy options or caching

## Dependencies

- Deployment target iOS 26.2 (already set)
- No external dependencies

# iOS 26 Location Modernisation – 2026-03-28

Revisit the `LocationHelper` in `SettingsView.swift` now that the deployment target is iOS 26.2:

- Replace `CLGeocoder` + `reverseGeocodeLocation(_:completionHandler:)` with `MKReverseGeocodingRequest` (MapKit)
- Replace the `CLLocationManagerDelegate` pattern with the modern async `CLLocationUpdate.updates` sequence
- Fix the Swift 6 warning: "reference to captured var 'self' in concurrently-executing code" in the `nonisolated` delegate callbacks

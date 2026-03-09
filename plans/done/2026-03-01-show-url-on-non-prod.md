# Show Current URL and API URL on Non-Production Environments

**Date**: 2026-03-01
**Status**: Complete

## Overview

Added a dev-only environment indicator to both the web app and iOS app, showing the active API URL (and current page URL on web) so it's always clear which environment you're connected to during development and testing.

## Architecture

### Key decisions

- **Web**: component guards itself with `import.meta.env.PROD` — renders `null` in production, no tree-shaking required. Hook (`useLocation`) is always called to satisfy the rules of hooks, with the early return placed after it.
- **Web SSR safety**: `window.location.origin` is accessed conditionally (`typeof window !== "undefined"`) since the component is rendered server-side. The path and search come from TanStack Router's `useLocation` which works in both environments.
- **Web search string**: `location.searchStr` used instead of `location.search` — in TanStack Router `search` is a parsed object, `searchStr` is the raw query string.
- **iOS**: `#if DEBUG` guard placed at the call site in `HeaderView`, not inside `DebugBannerView` itself, so the view compiles in all configurations and Xcode previews work normally.
- **Position**: web indicator is bottom-left to avoid overlapping the TanStack devtools panel (bottom-right).

## Files

| File | Purpose |
|------|---------|
| `src/web/src/components/DevEnvironmentIndicator.tsx` | Fixed bottom-left badge showing current URL and API URL, dev-only |
| `src/web/src/routes/__root.tsx` | Renders `<DevEnvironmentIndicator />` after `<Outlet />` |
| `src/ios/Nylon Impossible/Nylon Impossible/Views/Components/DebugBannerView.swift` | Capsule banner showing `Config.apiBaseURL`, debug-only |
| `src/ios/Nylon Impossible/Nylon Impossible/Views/Components/HeaderView.swift` | Renders `DebugBannerView` behind `#if DEBUG` below the title block |

## Key patterns

```tsx
// Web — hook before guard, SSR-safe window access
export default function DevEnvironmentIndicator() {
  const location = useLocation();

  if (import.meta.env.PROD) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const currentUrl = `${origin}${location.pathname}${location.searchStr}`;
  // ...
}
```

```swift
// iOS — guard at call site, not inside the view
#if DEBUG
DebugBannerView()
#endif
```

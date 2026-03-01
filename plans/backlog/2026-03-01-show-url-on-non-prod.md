# Show Current URL and API URL on iOS and Web (Non-Production Only)

## Summary

Add a visual indicator showing the current URL and API URL on both iOS and web platforms when not in production environment. This helps developers quickly identify which environment they're connected to during development and testing.

## Motivation

When developing locally or testing preview deployments, it's easy to lose track of which API endpoint the app is connected to. This is especially problematic when:
- Switching between local development and staging environments
- Debugging issues that may be environment-specific
- Testing iOS app against different API deployments

## Proposed Implementation

### Web (TanStack Start/React)

Add a non-intrusive indicator component that displays:
- Current page URL
- API base URL (from `API_URL` in config)

Display only when `import.meta.env.PROD` is `false` or when `import.meta.env.DEV` is `true`.

Location options:
1. Fixed badge in bottom-right corner (minimal)
2. Collapsible panel in header/footer
3. Dev-only route indicator

Suggested component location: `src/web/src/components/DevEnvironmentIndicator.tsx`

### iOS (SwiftUI)

Add an indicator that displays:
- Current base URL (web view URL or API base URL)
- API base URL (from configuration)

Display only when not in release/production build configuration.

Suggested implementation:
- Add to settings/debug menu, or
- Small badge in navigation bar when `DEBUG` flag is set

## Acceptance Criteria

- [ ] Web: URL indicator visible only in non-production environments
- [ ] Web: Shows both current page URL and API URL
- [ ] iOS: URL indicator visible only in debug builds
- [ ] iOS: Shows both current app URL and API URL
- [ ] Both implementations are visually unobtrusive
- [ ] Can be easily disabled/hidden when needed

## Relevant Files

- `src/web/src/lib/config.ts` — API URL configuration
- `src/web/src/components/` — Web component location
- `src/ios/Nylon Impossible/` — iOS app directory

## Notes

- Consider using a dismissible banner or badge that persists across page navigation
- For iOS, could leverage the existing debug menu if one exists
- Web implementation should check `import.meta.env` or `process.env.NODE_ENV`
- iOS implementation should use `#if DEBUG` compiler directives

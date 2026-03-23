# Dynamic Marketing Images & Screenshots

Automatically generate marketing images, app screenshots, and web screenshots as part of the build process so assets for superhighfives.com and the iOS App Store are always up-to-date.

## Problem

Marketing assets (App Store screenshots, website hero images, feature previews) are currently created manually and quickly go stale as the UI evolves. Every time the app changes, someone has to remember to retake and re-export screenshots across multiple device sizes and themes.

## Opportunity

Since the project already has GitHub Actions workflows for both web and iOS builds, we can hook into those pipelines to automatically produce pixel-perfect, up-to-date marketing assets on every build (or on demand). The assets would be committed or uploaded as build artifacts and could be pulled directly into the App Store submission and website.

## Ideas

- **Web screenshots**: Use Playwright (already a likely dev dependency for web tests) to take full-page and component-level screenshots of the running web app across breakpoints (mobile, tablet, desktop). Wrap key UI states in a framed device mockup for use on the website.
- **iOS screenshots**: Use Xcode's `xcodebuild test` screenshot capability or a tool like `fastlane snapshot` to capture the iOS simulator at all required App Store device sizes (6.9", 6.5", 5.5", 12.9" iPad).
- **Marketing frames**: Overlay screenshots onto device frames with a background, tagline, and branding using a tool like `sharp`, `canvas`, or a headless browser approach — similar to how App Store Connect expects framed screenshots.
- **Dark/light variants**: Capture both themes since the app supports both.
- **Output**: Artifacts uploaded to GitHub Actions or stored in an `assets/screenshots/` directory, with a separate workflow trigger so they don't slow down every CI run.

## References

- Existing CI: `.github/workflows/ios-deploy.yml`, `.github/workflows/web-deploy.yml`
- Branding assets: `assets/logo.svg`, `plans/done/2026-02-27-logo-and-branding.md`
- Potential tools: `fastlane snapshot`, `fastlane frameit`, Playwright, `sharp`

# Nylon Impossible

A cross-platform todo application with web and iOS clients.

## Structure

This is a monorepo containing:

- **`web/`** - Full-stack web application built with TanStack Start, deployed on Cloudflare Workers
- **`ios/`** - Native iOS application built with SwiftUI and SwiftData

## Web

The web client is a modern, full-stack todo application featuring:

- TanStack Start with file-based routing
- Cloudflare Workers + D1 database
- Authentication via Clerk
- Optimistic updates with TanStack Query
- Tailwind CSS with Cloudflare's Kumo design system

See [`web/README.md`](./web/README.md) for setup and development instructions.

## iOS

The iOS client is a native SwiftUI application featuring:

- SwiftUI with modern declarative UI patterns
- SwiftData for local persistence
- Custom gradient-based design system
- Smooth animations and transitions

Open the Xcode project at `ios/Nylon Impossible/Nylon Impossible.xcodeproj` to build and run.

## Getting started

### Web

```bash
cd web
npm install
npm run dev
```

### iOS

Open `ios/Nylon Impossible/Nylon Impossible.xcodeproj` in Xcode and run on a simulator or device.

## License

MIT

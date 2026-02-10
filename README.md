# Nylon Impossible

A cross-platform todo application with web and iOS clients.

## Structure

This is a monorepo managed with pnpm workspaces:

```
src/
  web/   - Full-stack web application (TanStack Start + Cloudflare Workers)
  ios/   - Native iOS application (SwiftUI + SwiftData)
```

## Getting started

```bash
pnpm install
```

## Web

The web client is a modern, full-stack todo application featuring:

- TanStack Start with file-based routing
- Cloudflare Workers + D1 database
- Authentication via Clerk
- Optimistic updates with TanStack Query
- Tailwind CSS with Cloudflare's Kumo design system

See [`src/web/README.md`](./src/web/README.md) for detailed setup instructions.

**Commands:**

```bash
pnpm web:dev      # Start dev server
pnpm web:build    # Build for production
pnpm web:test     # Run tests
pnpm web:deploy   # Deploy to Cloudflare
pnpm web:db:studio # Open Drizzle Studio
```

## iOS

The iOS client is a native SwiftUI application featuring:

- SwiftUI with modern declarative UI patterns
- SwiftData for local persistence
- Custom gradient-based design system
- Smooth animations and transitions

**Commands:**

```bash
pnpm ios:open      # Open in Xcode
pnpm ios:build     # Build via xcodebuild
pnpm ios:simulator # Open iOS Simulator
```

## License

MIT

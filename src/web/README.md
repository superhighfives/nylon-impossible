# Nylon Impossible (Web)

A modern, full-stack todo application built with TanStack Start, deployed on Cloudflare Workers with D1 database, featuring authentication via Clerk and real-time optimistic updates.

## Tech Stack

### Frontend
- **[TanStack Start](https://tanstack.com/start)** - Full-stack React framework with file-based routing
- **[TanStack Router](https://tanstack.com/router)** - Type-safe routing with data loading
- **[TanStack Query](https://tanstack.com/query)** - Data fetching, caching, and synchronization
- **[React 19](https://react.dev/)** - UI library
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety
- **[Tailwind CSS v4](https://tailwindcss.com/)** - Utility-first styling
- **[@base-ui/react](https://base-ui.com/)** - Headless UI primitives
- **[class-variance-authority](https://cva.style/)** - Component variant management

### Backend & Infrastructure
- **[Cloudflare Workers](https://workers.cloudflare.com/)** - Serverless edge runtime
- **[Cloudflare D1](https://developers.cloudflare.com/d1/)** - SQLite-based serverless database
- **[Clerk](https://clerk.com/)** - Authentication and user management
- **[Wrangler](https://developers.cloudflare.com/workers/wrangler/)** - Cloudflare developer platform CLI

### Development Tools
- **[Vite](https://vitejs.dev/)** - Fast build tool and dev server
- **[Biome](https://biomejs.dev/)** - Fast linter and formatter
- **[Vitest](https://vitest.dev/)** - Unit testing framework

## Architecture

### Server Functions

The application uses TanStack Start's server functions pattern for type-safe, RPC-style API calls:

```typescript
// Define server function with validation
export const createTodo = createServerFn({ method: "POST" })
  .inputValidator((input: CreateTodoInput) => createTodoSchema.parse(input))
  .handler(async (ctx) => {
    const db = env.DB; // Cloudflare D1 binding
    // ... database operations
  });

// Call from client with full type safety
await createTodo({ data: { title: "New task" } });
```

### Database Schema

The D1 database uses a simple relational schema:

- **users** - User accounts with Clerk integration
- **todos** - Todo items with user association, position tracking, and timestamps

Migrations are managed in the `migrations/` directory and applied via Wrangler.

### Authentication Flow

1. User signs in via Clerk (social providers or email/password)
2. Clerk provider wraps the application and manages session state
3. Server functions access user context via Clerk session
4. Database operations are scoped to the authenticated user

### Optimistic Updates

The application uses TanStack Query's optimistic update pattern for instant UI feedback:

1. User performs action (create, update, delete)
2. UI updates immediately with predicted result
3. Server request executes in background
4. On success: change is persisted
5. On error: UI rolls back to previous state

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 9+
- Cloudflare account (for deployment)
- Clerk account (for authentication)

### Installation

```bash
# Install dependencies (from repo root)
pnpm install
```

### Environment Setup

#### 1. Clerk Configuration

Get your Clerk publishable key from the [Clerk Dashboard](https://dashboard.clerk.com):

Create **`.dev.vars`** (for local development):
```bash
CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
```

Create **`.env.local`** (for Vite client-side):
```bash
CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
```

Update **`wrangler.jsonc`** (for production):
```jsonc
{
  "vars": {
    "CLERK_PUBLISHABLE_KEY": "pk_test_your_key_here"
  }
}
```

#### 2. Generate Cloudflare Types

After configuring `wrangler.jsonc`, generate TypeScript types:

```bash
npm run cf-typegen
```

This creates `worker-configuration.d.ts` with proper types for your D1 database and environment variables.

### Database Setup

#### 1. Create D1 Database

```bash
npm run db:create
```

This will output a database ID. Add it to `wrangler.jsonc`:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "nylon-impossible-db",
      "database_id": "your-database-id-here"
    }
  ]
}
```

#### 2. Apply Migrations

For local development:
```bash
npm run db:migrations:apply
```

For production:
```bash
npm run db:migrations:apply:remote
```

View migration history:
```bash
npm run db:migrations:list
```

### Development

Start the development server:

```bash
npm run dev
```

The application will be available at **http://localhost:3000**

### Development Tools

The app includes integrated DevTools accessible in the browser:

- **TanStack Router DevTools** - Route inspection and navigation debugging
- **TanStack Query DevTools** - Cache inspection and query state monitoring

## Project Structure

```
nylon-impossible-web/
├── migrations/              # D1 database migrations
├── src/
│   ├── components/          # React components
│   │   ├── Header.tsx      # App header with auth
│   │   ├── LandingPage.tsx # Unauthenticated home
│   │   ├── TodoInput.tsx   # Create todo form
│   │   └── TodoList.tsx    # Todo list display
│   ├── hooks/              # Custom React hooks
│   │   └── useTodos.ts     # Todo CRUD operations
│   ├── integrations/       # Third-party integrations
│   │   └── tanstack-query/ # Query client setup
│   ├── lib/                # Utility functions
│   │   ├── db-client.ts    # Database client
│   │   ├── schema.ts       # Drizzle schema
│   │   └── validation.ts   # Zod schemas
│   ├── routes/             # File-based routing
│   │   ├── __root.tsx      # Root layout
│   │   └── index.tsx       # Home page
│   ├── server/             # Server functions
│   │   └── todos.ts        # Todo CRUD server functions
│   ├── types/              # TypeScript type definitions
│   │   └── database.ts     # Database types
│   └── styles.css          # Global styles (Tailwind)
├── .dev.vars               # Local environment variables (git-ignored)
├── .env.local              # Vite environment variables (git-ignored)
├── wrangler.jsonc          # Cloudflare Workers configuration
├── worker-configuration.d.ts # Generated Cloudflare types
└── vite.config.ts          # Vite configuration
```

## Scripts

### Development
- `npm run dev` - Start dev server on port 3000
- `npm run serve` - Preview production build locally

### Building
- `npm run build` - Build for production
- `npm run cf-typegen` - Generate Cloudflare types

### Database (Wrangler D1)
- `npm run db:create` - Create new D1 database
- `npm run db:migrations:list` - List migration history
- `npm run db:migrations:apply` - Apply migrations locally
- `npm run db:migrations:apply:remote` - Apply migrations to production

### Database (Drizzle Kit)
- `npm run db:generate` - Generate migrations from schema changes
- `npm run db:studio` - Open Drizzle Studio to browse database
- `npm run db:push` - Push schema changes directly (dev only)

### Code Quality
- `pnpm lint` - Run Biome linter
- `pnpm format` - Format code with Biome
- `pnpm check` - Run Biome lint + format check
- `pnpm typecheck` - Run TypeScript type checking
- `pnpm test` - Run Vitest tests

### Deployment
- `npm run deploy` - Deploy to Cloudflare Workers

## Deployment

### 1. Configure Production Environment

Ensure your production Clerk key is set in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "CLERK_PUBLISHABLE_KEY": "pk_live_your_production_key"
  }
}
```

### 2. Apply Production Migrations

```bash
npm run db:migrations:apply:remote
```

### 3. Deploy to Cloudflare

```bash
npm run deploy
```

Your app will be deployed to `https://nylon-impossible.your-subdomain.workers.dev`

### 4. Configure Custom Domain (Optional)

In the [Cloudflare Dashboard](https://dash.cloudflare.com/):
1. Navigate to Workers & Pages
2. Select your worker
3. Go to Settings > Triggers
4. Add a custom domain

## Key Features

### ✨ Authentication
- Sign in with social providers (Google, GitHub, etc.)
- Email/password authentication
- Session management via Clerk
- Protected routes with `<SignedIn>` / `<SignedOut>` components

### 📝 Todo Management
- Create, read, update, delete todos
- Mark todos as complete/incomplete
- Reorder todos via drag-and-drop (position tracking)
- Optimistic UI updates for instant feedback

### 🚀 Performance
- Server-side rendering (SSR) on Cloudflare's edge network
- Optimistic updates for zero perceived latency
- Efficient query caching with TanStack Query
- Minimal JavaScript bundle with code splitting

### 🔒 Type Safety
- End-to-end type safety from database to UI
- Zod schema validation for runtime safety
- Generated types for Cloudflare bindings
- Type-safe server function calls

## Adding Features

### Adding a UI Component

UI components are imported from `@/components/ui`:

```tsx
import { Button, Input, Checkbox } from "@/components/ui";
```

These are custom components built on `@base-ui/react` primitives with Tailwind styling via `class-variance-authority`. See `src/components/ui/` for available components.

### Creating a New Route

Add a file in `src/routes/`:

```tsx
// src/routes/about.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return <div>About page</div>
}
```

### Creating a Server Function

```typescript
// src/server/example.ts
import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'

export const exampleFunction = createServerFn({ method: 'GET' })
  .inputValidator((input: { id: string }) => input)
  .handler(async (ctx) => {
    const db = env.DB
    const { id } = ctx.data
    // ... database operations
    return result
  })
```

### Creating a Database Migration

```bash
# Create migration file
mkdir -p migrations
touch migrations/0002_add_tags_table.sql
```

```sql
-- migrations/0002_add_tags_table.sql
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_tags_user_id ON tags(user_id);
```

Apply the migration:
```bash
npm run db:migrations:apply
```

## Troubleshooting

### Types Not Working

Regenerate Cloudflare types after changing `wrangler.jsonc`:
```bash
npm run cf-typegen
```

### Environment Variables Not Loading

1. Ensure `.dev.vars` exists with correct values
2. Restart the dev server after changing environment variables
3. For production, update `wrangler.jsonc` and redeploy

### Database Errors

Check your D1 database exists:
```bash
npx wrangler d1 list
```

View migrations status:
```bash
npm run db:migrations:list
```

### Clerk Authentication Issues

1. Verify your publishable key is correct
2. Check your Clerk dashboard for allowed domains
3. Ensure your local development URL (http://localhost:3000) is allowed

## Learn More

- [TanStack Start Documentation](https://tanstack.com/start)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Clerk Documentation](https://clerk.com/docs)
- [TanStack Query Documentation](https://tanstack.com/query)
- [TanStack Router Documentation](https://tanstack.com/router)

## License

MIT

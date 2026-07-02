# @nylon-impossible/admin

Standalone admin app for Nylon Impossible. Deployed to its own Cloudflare Worker
(separate from the user-facing web app) so admin UI never ships in the public
bundle. Auth via Clerk; admin role is `publicMetadata.role === "admin"` on the
Clerk user.

## Local dev

```sh
cp .env.example .env.local
# fill in VITE_CLERK_PUBLISHABLE_KEY and VITE_API_BASE_URL
pnpm admin:dev
```

The app runs at http://localhost:3100. Sign in with a Clerk user that has
`publicMetadata.role = "admin"` set in the Clerk dashboard.

## Deploy

```sh
pnpm admin:deploy
```

Static assets are served by `nylon-impossible-admin` Worker via Workers Static
Assets. Configure the production hostname (`admin.nylonimpossible.com` or
similar) in the Cloudflare dashboard.

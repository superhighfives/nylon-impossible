# Admin Interface

Brief description: A lightweight admin interface for managing users across Nylon Impossible and Clerk. Should support viewing users, deleting accounts (cascading DB + Clerk), flipping plans between free/pro, and basic diagnostics (todo count, last sync, research usage).

Key decisions to make before speccing:
- Where it lives (admin route in the web app, standalone app, or API-only)
- How admin identity is determined (hardcoded IDs, Clerk role, or DB column)
- Whether self-serve account deletion (`DELETE /users/me` + Clerk webhook) should ship independently as a quick win ahead of the full admin UI

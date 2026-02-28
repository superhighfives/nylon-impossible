# Security Hardening

Review and harden auth / permissions across the stack.

## Areas

- **Clerk JWT verification** — ensure all API endpoints validate JWTs and reject expired / malformed tokens
- **D1 row-level access** — confirm users can only read/write their own data; no cross-tenant leakage
- **Durable Object auth** — verify WebSocket connections are authenticated and scoped to the correct user
- **iOS client** — ensure tokens are refreshed correctly and unauthenticated states are handled gracefully
- **Edge cases** — account deletion, token revocation, concurrent sessions

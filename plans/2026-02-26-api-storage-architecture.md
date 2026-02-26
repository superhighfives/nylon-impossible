# API storage architecture: Durable Objects vs D1

Evaluate whether Durable Objects are the right approach for the API, or if D1 is the better fit.

## Decision

**Use D1. Durable Objects are not the right tool for this project.**

The API already uses D1, which is the correct choice. This document explains why.

---

## What are Durable Objects?

Durable Objects are Cloudflare's primitive for stateful, strongly-consistent coordination at the edge. Each Durable Object is a single-instance actor with:

- Its own isolated key-value storage
- A single-threaded execution model (no concurrent requests to the same instance)
- Great for: WebSocket connections, distributed locks, real-time collaboration, rate limiting per entity

They are **not** a general-purpose database. Querying across multiple Durable Objects (e.g., "list all todos for a user") requires manual fan-out coordination, which is complex and slow.

## What is D1?

D1 is Cloudflare's serverless SQLite database. It supports:

- Full SQL queries across all rows and users
- Foreign keys, indexes, joins
- Read replicas across Cloudflare's edge network
- Familiar relational data model

---

## Analysis

### What this project needs from storage

| Requirement | D1 | Durable Objects |
|---|---|---|
| List all todos for a user | ✅ Single query | ❌ Requires one DO per user + fan-out |
| Create/update/delete a todo | ✅ Simple INSERT/UPDATE/DELETE | ✅ Works but over-engineered |
| Filter by completed, position, date | ✅ SQL WHERE clause | ❌ Requires manual iteration |
| Shared schema between web + API workers | ✅ Same D1 database, same migrations | ❌ Each DO has isolated storage |
| Sync endpoint (bulk read + write) | ✅ Single transaction | ❌ Complex fan-out |
| User ownership enforcement | ✅ `WHERE user_id = ?` | ❌ Must encode in DO ID naming |

### Where Durable Objects would add value

Durable Objects would make sense if the project added:

- **Real-time collaboration** — multiple users editing the same todo list simultaneously, needing WebSocket connections and in-memory state per list
- **Per-user rate limiting** — a single DO per user can enforce limits with strong consistency
- **Live sync / push notifications** — a DO per connected client can hold a WebSocket and fan out changes

None of these are in scope for the current project (see the plan's "Out of scope" section).

### Cost comparison

For a simple todo app with hundreds of users:

- **D1**: Covered by the free tier for small workloads. Predictable cost as usage grows. See [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) for current limits.
- **Durable Objects**: Billed per request + per GB-second of active duration. For stateless CRUD, this is more expensive than D1 with no benefit.

---

## Conclusion

D1 is the correct storage backend for the API. The current implementation is appropriate.

**Summary of reasons:**

1. The data is relational (users → todos with foreign keys)
2. Cross-user queries are not needed, but cross-todo queries for a single user are (list, filter, sort)
3. The web app and API worker share the same D1 database — no sync layer needed between them
4. D1 supports the bulk sync endpoint (`POST /todos/sync`) cleanly in a single transaction
5. Durable Objects would require one DO per user to store todos, making queries complex and expensive

---

## If real-time sync is added later

If the project ever adds real-time push from server to iOS (e.g., "web changes reflected on iOS without polling"), the right pattern would be:

```
D1 (source of truth)
   ↓ change event
Durable Object (one per connected client, holds WebSocket)
   ↓ push
iOS app
```

D1 remains the source of truth. A small number of Durable Objects handle active WebSocket connections. This is the standard Cloudflare pattern and does not require migrating away from D1.

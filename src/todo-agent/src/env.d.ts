// `import { env } from "cloudflare:workers"` types `env` as `Cloudflare.Env`
// (see @cloudflare/workers-types' `declare namespace Cloudflare { interface
// Env {} }`) — augment that ambient namespace directly, not a module-scoped
// one, or the merge silently no-ops and `env.API` etc. stay untyped.
declare namespace Cloudflare {
  interface Env {
    AI: Ai;
    API: Fetcher;
    INTERNAL_AGENT_SECRET?: string;
  }
}

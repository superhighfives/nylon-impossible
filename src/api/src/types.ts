export interface ResearchJobMessage {
  todoId: string;
  userId: string;
  query: string;
  researchType: "general" | "location";
  researchId: string;
  userLocation?: string | null;
}

/**
 * Verified claims from a Google-signed ID token carried on requests from the
 * Gmail add-on. Only the fields we rely on are typed; `sub` and `email`
 * identify the end user for `resolveNylonUser`.
 */
export interface GoogleIdTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  email?: string;
  email_verified?: boolean;
  exp: number;
}

export type Env = {
  Bindings: {
    AI: Ai;
    DB: D1Database;
    USER_SYNC: DurableObjectNamespace;
    RESEARCH_QUEUE: Queue<ResearchJobMessage>;
    CLERK_SECRET_KEY: string;
    CLERK_PUBLISHABLE_KEY: string;
    CLERK_WEBHOOK_SECRET?: string;
    SENTRY_DSN?: string;
    ENVIRONMENT?: string;
    CF_AI_GATEWAY_ID?: string;
    LOG_AI_DEBUG?: string;
    TAVILY_API_KEY?: string;
    // Target audience the Gmail add-on's Google-signed ID tokens must carry in
    // their `aud` claim — the add-on endpoint URL configured in Google Cloud.
    // Public (not a secret); set in wrangler.jsonc. verifyGoogleIdToken fails
    // closed if it's unset.
    GMAIL_ADDON_AUDIENCE?: string;
    // Public base URL of the web app, used to build the connect-flow link on the
    // "Connect Nylon" card. Set in wrangler.jsonc; defaults to production.
    WEB_BASE_URL?: string;
    // HMAC secret shared with the web Worker to sign/verify the connect-flow
    // state (prevents binding an attacker's Gmail identity to a victim's
    // account). Set via `wrangler secret put`, so it's absent from wrangler.jsonc.
    GMAIL_ADDON_STATE_SECRET?: string;
  };
  Variables: {
    userId: string;
    aiEnabled: boolean;
    plan: "free" | "pro";
    role: "admin" | null;
    // Set by verifyGoogleIdToken on the /gmail-addon/* routes.
    googleClaims: GoogleIdTokenClaims;
  };
};

export type Env = {
  Bindings: {
    DB: D1Database;
    USER_SYNC: DurableObjectNamespace;
    CF_ACCOUNT_ID: string;
    AI_GATEWAY_ID: string;
    AI_GATEWAY_TOKEN: string;
    CLERK_SECRET_KEY: string;
    CLERK_PUBLISHABLE_KEY: string;
    ENVIRONMENT?: string;
  };
  Variables: {
    userId: string;
  };
};

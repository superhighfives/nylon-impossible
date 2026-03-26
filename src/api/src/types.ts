export type Env = {
  Bindings: {
    AI: Ai;
    DB: D1Database;
    USER_SYNC: DurableObjectNamespace;
    CLERK_SECRET_KEY: string;
    CLERK_PUBLISHABLE_KEY: string;
    ENVIRONMENT?: string;
  };
  Variables: {
    userId: string;
    aiEnabled: boolean;
  };
};

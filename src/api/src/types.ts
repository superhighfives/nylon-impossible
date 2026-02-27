export type Env = {
  Bindings: {
    DB: D1Database;
    USER_SYNC: DurableObjectNamespace;
    CLERK_SECRET_KEY: string;
    CLERK_PUBLISHABLE_KEY: string;
  };
  Variables: {
    userId: string;
  };
};

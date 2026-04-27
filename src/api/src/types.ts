export interface ResearchJobMessage {
  todoId: string;
  userId: string;
  query: string;
  researchType: "general" | "location";
  researchId: string;
  userLocation?: string | null;
}

export type Env = {
  Bindings: {
    AI: Ai;
    DB: D1Database;
    USER_SYNC: DurableObjectNamespace;
    RESEARCH_QUEUE: Queue<ResearchJobMessage>;
    CLERK_SECRET_KEY: string;
    CLERK_PUBLISHABLE_KEY: string;
    SENTRY_DSN?: string;
    ENVIRONMENT?: string;
    CF_AI_GATEWAY_ID?: string;
    LOG_AI_DEBUG?: string;
  };
  Variables: {
    userId: string;
    aiEnabled: boolean;
  };
};

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_IS_PREVIEW?: string;
  // The build's git commit, sent with feedback. Falls back to GITHUB_SHA in
  // CI (see vite.config.ts).
  readonly VITE_COMMIT_SHA?: string;
}

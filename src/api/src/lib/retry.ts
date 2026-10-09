/**
 * Run `fn`, retrying on failure with a short linear backoff. For idempotent
 * background work (the hourly list sweep) where a transient D1 error — a
 * dropped connection, a busy database — would otherwise lose the run: the
 * sweep only acts on users in their local midnight hour, so a single failed
 * run skips their aging until the next day.
 *
 * Rethrows the last error once every attempt has failed.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  {
    attempts = 3,
    delayMs = 1000,
  }: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }
  throw lastError;
}

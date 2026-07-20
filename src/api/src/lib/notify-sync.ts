/**
 * Notify all connected WebSocket clients for a user to sync.
 *
 * Web and iOS clients hold a Durable Object WebSocket; poking the DO's
 * `/notify` endpoint makes them re-pull. Best-effort — a failure here must
 * never fail the write that triggered it, so errors are swallowed (clients
 * still catch up on their next poll).
 */
export async function notifySync(
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
): Promise<void> {
  try {
    const id = env.USER_SYNC.idFromName(userId);
    const stub = env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical — clients will sync on next poll.
  }
}

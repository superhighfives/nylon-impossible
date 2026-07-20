/**
 * Server function backing the Gmail add-on connect flow. The add-on shows a
 * "Connect Nylon" card linking here with a signed `state`; once the user is
 * authenticated with Clerk we verify the state and record the
 * `{ googleSub → clerkUserId }` link so their Gmail panel resolves to this
 * account from then on.
 */

import { env } from "cloudflare:workers";
import { verifyAddonState } from "@nylon-impossible/shared/addon-state";
import { createServerFn } from "@tanstack/react-start";
import { Effect } from "effect";
import { DatabaseError, ValidationError } from "@/lib/errors";
import { gmailAddonLinks } from "@/lib/schema";
import { runEffect, withAuthenticatedUser } from "@/lib/utils";

// The HMAC secret is set with `wrangler secret put`, so it isn't in the
// generated Cloudflare.Env type — read it through a narrow cast.
function stateSecret(): string | undefined {
  return (env as unknown as { GMAIL_ADDON_STATE_SECRET?: string })
    .GMAIL_ADDON_STATE_SECRET;
}

export const connectGmailAddon = createServerFn({ method: "POST" })
  .validator((state: unknown) => {
    if (typeof state !== "string" || state.length === 0) {
      throw new ValidationError({
        errors: [{ path: "state", message: "Missing connect state" }],
      });
    }
    return state;
  })
  .handler(async (ctx) => {
    const state = ctx.data;

    const program = withAuthenticatedUser((user, db) =>
      Effect.gen(function* () {
        const secret = stateSecret();
        if (!secret) {
          return yield* new ValidationError({
            errors: [
              { path: "state", message: "Add-on connect is not configured." },
            ],
          });
        }

        const payload = yield* Effect.tryPromise({
          try: () => verifyAddonState(secret, state),
          catch: (error) =>
            new DatabaseError({ operation: "verifyAddonState", cause: error }),
        });
        if (!payload) {
          return yield* new ValidationError({
            errors: [
              {
                path: "state",
                message:
                  "This connect link is invalid or has expired. Reopen the panel in Gmail and try again.",
              },
            ],
          });
        }

        const email = payload.email ?? user.email;
        yield* Effect.tryPromise({
          try: () =>
            db
              .insert(gmailAddonLinks)
              .values({
                googleSub: payload.googleSub,
                clerkUserId: user.id,
                email,
              })
              // Re-connecting (or connecting a Google identity previously bound
              // to another account) re-points the link at the current user.
              .onConflictDoUpdate({
                target: gmailAddonLinks.googleSub,
                set: { clerkUserId: user.id, email },
              }),
          catch: (error) =>
            new DatabaseError({
              operation: "recordGmailAddonLink",
              cause: error,
            }),
        });

        return { connected: true as const };
      }),
    );

    return runEffect(program);
  });

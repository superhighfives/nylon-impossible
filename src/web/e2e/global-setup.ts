import { clerkSetup } from "@clerk/testing/playwright";
import { findOrCreateClerkUser } from "@nylon-impossible/shared/seed-account";
import { email, secretKey, seed } from "./account";

/**
 * Find or create this run's Clerk user, and seed its data. Specs reseed
 * before they start (fixtures.ts), so this first seed mostly checks that the
 * D1 is reachable before any browser starts.
 */
export default async function globalSetup(): Promise<void> {
  // Fetches a testing token so Clerk's bot protection lets the browser in.
  await clerkSetup({
    publishableKey:
      process.env.CLERK_PUBLISHABLE_KEY ??
      process.env.VITE_CLERK_PUBLISHABLE_KEY,
  });
  const userId = await findOrCreateClerkUser(secretKey(), email);
  // Workers inherit the runner's environment.
  process.env.SMOKE_USER_ID = userId;
  seed(userId);
  console.log(`smoke: signed in as ${email} (${userId}), seeded`);
}

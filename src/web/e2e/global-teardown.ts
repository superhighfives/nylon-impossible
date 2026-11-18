import { appendFileSync } from "node:fs";
import {
  deleteClerkUser,
  findClerkUserId,
} from "@nylon-impossible/shared/seed-account";
import { countRows, email, reset, secretKey } from "./account";

/** Delete the run's rows and its Clerk user, and say what's left (nothing). */
export default async function globalTeardown(): Promise<void> {
  const userId =
    process.env.SMOKE_USER_ID ?? (await findClerkUserId(secretKey(), email));
  if (!userId) {
    console.log(`smoke: no Clerk user ${email}, nothing to clean up`);
    return;
  }
  reset(userId);
  console.log(`smoke: deleted ${userId}'s rows from D1`);
  await deleteClerkUser(secretKey(), userId);
  const left = await findClerkUserId(secretKey(), email);
  console.log(`smoke: deleted Clerk user ${email} (${userId})`);
  const rows = countRows(userId);
  console.log(`smoke: SELECT count(*) for ${userId}: ${rows}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "### Clean-up",
        "",
        `- D1 rows left for \`${userId}\` (users, lists, todos): **${rows}**`,
        `- Clerk user \`${email}\`: **${left ? "still there" : "deleted"}**`,
        "",
      ].join("\n"),
    );
  }
  if (rows !== 0 || left) {
    throw new Error(`smoke: clean-up left ${rows} row(s), Clerk user ${left}`);
  }
}

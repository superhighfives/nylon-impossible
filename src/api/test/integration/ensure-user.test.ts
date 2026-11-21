import { env } from "cloudflare:test";
import {
  DEMO_SEED_EMAILS,
  DEMO_SEED_TODOS,
} from "@nylon-impossible/shared/demo-seed";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, getDb, lists, todos, todoUrls } from "../../src/lib/db";
import { ensureUser } from "../../src/lib/ensure-user";
import type { Env } from "../../src/types";
import { mockGetUser } from "../__mocks__/clerk-backend";
import { cleanDb } from "../helpers";

const USER = "user_demo_1";
const DEV_ENV = { ...env, ENVIRONMENT: "development" } as Env["Bindings"];

function signInAs(email: string) {
  mockGetUser.mockResolvedValue({ emailAddresses: [{ emailAddress: email }] });
}

describe("ensureUser", () => {
  beforeEach(cleanDb);
  afterEach(() => signInAs("test@example.com"));

  it("seeds every demo todo and link for a demo email", async () => {
    const [email] = DEMO_SEED_EMAILS;
    signInAs(email);
    const db = getDb(env.DB);

    expect(await ensureUser(DEV_ENV, db, USER)).toBe("ok");

    const seededTodos = await db
      .select({ id: todos.id })
      .from(todos)
      .where(eq(todos.userId, USER));
    expect(seededTodos).toHaveLength(DEMO_SEED_TODOS.length);
    const links = DEMO_SEED_TODOS.flatMap((t) => t.urls ?? []);
    expect(await db.select({ id: todoUrls.id }).from(todoUrls)).toHaveLength(
      links.length,
    );
  });

  it("seeds only the system lists for anyone else", async () => {
    signInAs("someone@example.com");
    const db = getDb(env.DB);

    expect(await ensureUser(DEV_ENV, db, USER)).toBe("ok");

    expect(
      await db.select().from(lists).where(eq(lists.userId, USER)),
    ).toHaveLength(3);
    expect(await db.select().from(todos)).toHaveLength(0);
  });
});

import { env, SELF } from "cloudflare:test";
import { verifyToken } from "@clerk/backend";
import { automaticTimezoneUpdate } from "@nylon-impossible/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb, users } from "../../src/lib/db";
import { cleanDb, seedUser } from "../helpers";

const mockVerifyToken = verifyToken as ReturnType<
  typeof import("vitest")["vi"]["fn"]
>;

const HEADERS = {
  Authorization: "Bearer test-token",
  "Content-Type": "application/json",
};
const USER = "user_test_123";

interface UserBody {
  timezone: string;
  timezoneAuto: boolean;
}

function patchMe(body: object) {
  return SELF.fetch("http://localhost/users/me", {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
}

async function getMe() {
  const res = await SELF.fetch("http://localhost/users/me", {
    headers: HEADERS,
  });
  return res.json<UserBody>();
}

async function stored() {
  const [row] = await getDb(env.DB)
    .select({ timezone: users.timezone, timezoneAuto: users.timezoneAuto })
    .from(users)
    .where(eq(users.id, USER));
  return row;
}

describe("users/me timezone", () => {
  beforeEach(async () => {
    await cleanDb();
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: USER });
    await seedUser();
  });

  it("defaults to automatic UTC", async () => {
    expect(await getMe()).toMatchObject({
      timezone: "UTC",
      timezoneAuto: true,
    });
  });

  it("accepts an automatic report without turning automatic off", async () => {
    const res = await patchMe({ timezone: "Europe/London" });
    expect(res.status).toBe(200);
    expect(await res.json<UserBody>()).toMatchObject({
      timezone: "Europe/London",
      timezoneAuto: true,
    });
  });

  it("stores a manual pick with timezoneAuto false", async () => {
    const res = await patchMe({
      timezone: "Asia/Tokyo",
      timezoneAuto: false,
    });
    expect(res.status).toBe(200);
    expect(await stored()).toEqual({
      timezone: "Asia/Tokyo",
      timezoneAuto: false,
    });
  });

  it("can switch back to automatic", async () => {
    await patchMe({ timezone: "Asia/Tokyo", timezoneAuto: false });
    await patchMe({ timezone: "Europe/Paris", timezoneAuto: true });
    expect(await stored()).toEqual({
      timezone: "Europe/Paris",
      timezoneAuto: true,
    });
  });

  it("rejects a zone that isn't IANA", async () => {
    const res = await patchMe({ timezone: "Mars/Olympus" });
    expect(res.status).toBe(400);
    expect((await res.json<{ code: string }>()).code).toBe(
      "validation_failed",
    );
    expect((await stored()).timezone).toBe("UTC");
  });

  it("rejects a non-boolean timezoneAuto", async () => {
    const res = await patchMe({ timezoneAuto: "yes" });
    expect(res.status).toBe(400);
  });
});

describe("automaticTimezoneUpdate", () => {
  it("reports a changed device zone when automatic", () => {
    expect(
      automaticTimezoneUpdate(
        { timezone: "UTC", timezoneAuto: true },
        "Europe/London",
      ),
    ).toEqual({ timezone: "Europe/London" });
  });

  it("treats a missing flag (older server) as automatic", () => {
    expect(
      automaticTimezoneUpdate({ timezone: "UTC" }, "Asia/Tokyo"),
    ).toEqual({ timezone: "Asia/Tokyo" });
  });

  it("does nothing when the zones already match", () => {
    expect(
      automaticTimezoneUpdate(
        { timezone: "Europe/London", timezoneAuto: true },
        "Europe/London",
      ),
    ).toBeNull();
  });

  it("leaves a manual zone alone", () => {
    expect(
      automaticTimezoneUpdate(
        { timezone: "Asia/Tokyo", timezoneAuto: false },
        "Europe/London",
      ),
    ).toBeNull();
  });

  it("ignores an unusable device zone", () => {
    expect(
      automaticTimezoneUpdate({ timezone: "UTC", timezoneAuto: true }, ""),
    ).toBeNull();
    expect(
      automaticTimezoneUpdate(
        { timezone: "UTC", timezoneAuto: true },
        "Not/AZone",
      ),
    ).toBeNull();
  });
});

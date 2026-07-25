import {
  signAddonState,
  verifyAddonState,
} from "@nylon-impossible/shared/addon-state";
import { describe, expect, it } from "vitest";

const SECRET = "test-addon-state-secret";
const NOW = 1_700_000_000;

describe("addon connect-flow state", () => {
  it("round-trips a payload through sign + verify", async () => {
    const token = await signAddonState(
      SECRET,
      { googleSub: "sub-123", email: "user@example.com" },
      NOW,
    );
    const payload = await verifyAddonState(SECRET, token, NOW + 1);
    expect(payload).not.toBeNull();
    expect(payload?.googleSub).toBe("sub-123");
    expect(payload?.email).toBe("user@example.com");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signAddonState(
      SECRET,
      { googleSub: "sub-123", email: null },
      NOW,
    );
    expect(await verifyAddonState("wrong-secret", token, NOW + 1)).toBeNull();
  });

  it("rejects a tampered payload (googleSub swapped)", async () => {
    const token = await signAddonState(
      SECRET,
      { googleSub: "sub-123", email: null },
      NOW,
    );
    const [, sig] = token.split(".");
    const forgedBody = btoa(
      JSON.stringify({ googleSub: "attacker", email: null, exp: NOW + 600 }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(
      await verifyAddonState(SECRET, `${forgedBody}.${sig}`, NOW + 1),
    ).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await signAddonState(
      SECRET,
      { googleSub: "sub-123", email: null },
      NOW,
      600,
    );
    expect(await verifyAddonState(SECRET, token, NOW + 601)).toBeNull();
  });

  it("rejects a malformed token", async () => {
    expect(await verifyAddonState(SECRET, "garbage", NOW)).toBeNull();
  });
});

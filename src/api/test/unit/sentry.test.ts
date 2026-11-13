import type { ErrorEvent } from "@sentry/cloudflare";
import { describe, expect, it } from "vitest";
import { beforeSend } from "../../src/lib/sentry";

const event = (request: ErrorEvent["request"]): ErrorEvent => ({
  type: undefined,
  request,
});

describe("beforeSend", () => {
  it.each(["authorization", "Authorization", "AUTHORIZATION"])(
    "drops the %s header",
    (name) => {
      const out = beforeSend(
        event({
          url: "https://api.nylonimpossible.com/v1/lists",
          headers: { [name]: "Bearer nyl_secret", "user-agent": "curl/8" },
        }),
      );
      expect(out.request?.headers).toEqual({ "user-agent": "curl/8" });
      expect(JSON.stringify(out)).not.toContain("nyl_secret");
    },
  );

  it("still drops the request body", () => {
    const out = beforeSend(event({ data: '{"title":"Private"}' }));
    expect(out.request?.data).toBeUndefined();
  });

  it("leaves an event without a request alone", () => {
    const e = event(undefined);
    expect(beforeSend(e)).toBe(e);
  });
});

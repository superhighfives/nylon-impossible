import { API_TOKEN_PATTERN, V1_ERRORS } from "@nylon-impossible/shared/api-v1";
import { describe, expect, it } from "vitest";
import { generateApiToken, hashApiToken } from "../../src/lib/api-token";
import { API_ERRORS } from "../../src/lib/errors";

describe("/v1 error codes", () => {
  it.each(Object.entries(V1_ERRORS))(
    "%s has the status the docs give it",
    (code, status) => {
      expect(API_ERRORS[code as keyof typeof API_ERRORS].status).toBe(status);
    },
  );
});

describe("generateApiToken", () => {
  it("is nyl_ and 32 random bytes, base64url, 47 characters", () => {
    const token = generateApiToken();
    expect(token).toMatch(API_TOKEN_PATTERN);
    expect(token).toHaveLength(47);
    expect(generateApiToken()).not.toBe(token);
  });
});

describe("hashApiToken", () => {
  it("is the SHA-256 hex of the token", async () => {
    expect(await hashApiToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

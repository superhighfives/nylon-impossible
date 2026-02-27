import { describe, it, expect, beforeEach } from "vitest";
import { verifyToken } from "@clerk/backend";
import { verifyClerkJWT } from "../../src/lib/auth";

// @clerk/backend is aliased to our mock in vitest.config.ts
const mockVerifyToken = verifyToken as ReturnType<typeof import("vitest")["vi"]["fn"]>;

const fakeEnv = { CLERK_SECRET_KEY: "sk_test_fake" };

describe("verifyClerkJWT", () => {
  beforeEach(() => {
    mockVerifyToken.mockReset();
    mockVerifyToken.mockResolvedValue({ sub: "user_test_123" });
  });

  it("returns null when Authorization header is missing", async () => {
    const result = await verifyClerkJWT(null, fakeEnv);
    expect(result).toBeNull();
  });

  it("returns null when Authorization header is empty", async () => {
    const result = await verifyClerkJWT("", fakeEnv);
    expect(result).toBeNull();
  });

  it("returns null when Authorization header does not start with Bearer", async () => {
    const result = await verifyClerkJWT("Basic abc123", fakeEnv);
    expect(result).toBeNull();
  });

  it("returns null when token verification throws", async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error("Invalid token"));
    const result = await verifyClerkJWT("Bearer bad-token", fakeEnv);
    expect(result).toBeNull();
  });

  it("returns null when payload has no sub", async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: "" } as any);
    const result = await verifyClerkJWT("Bearer valid-token", fakeEnv);
    expect(result).toBeNull();
  });

  it("returns userId when token is valid", async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: "user_123" } as any);
    const result = await verifyClerkJWT("Bearer valid-token", fakeEnv);
    expect(result).toEqual({ userId: "user_123" });
  });

  it("passes the secret key to verifyToken", async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: "user_123" } as any);
    await verifyClerkJWT("Bearer my-token", fakeEnv);
    expect(mockVerifyToken).toHaveBeenCalledWith("my-token", {
      secretKey: "sk_test_fake",
    });
  });
});

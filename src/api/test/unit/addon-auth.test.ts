import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyGoogleToken } from "../../src/lib/addon-auth";

const AUDIENCE = "https://api.nylonimpossible.com/gmail-addon";
const ISSUER = "https://accounts.google.com";

let privateKey: CryptoKey;
let publicKey: CryptoKey;
// A second, unrelated keypair — signing with this but verifying against
// `publicKey` simulates a forged/bad signature.
let otherPrivateKey: CryptoKey;

async function sign(
  claims: Record<string, unknown>,
  options: { key?: CryptoKey; expiresIn?: string; audience?: string } = {},
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setSubject((claims.sub as string) ?? "google-sub-123")
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "5m")
    .sign(options.key ?? privateKey);
}

describe("verifyGoogleToken", () => {
  beforeAll(async () => {
    ({ privateKey, publicKey } = await generateKeyPair("RS256", {
      extractable: true,
    }));
    ({ privateKey: otherPrivateKey } = await generateKeyPair("RS256", {
      extractable: true,
    }));
  });

  it("accepts a genuine Google-signed token with the right audience", async () => {
    const token = await sign({
      sub: "google-sub-123",
      email: "user@example.com",
      email_verified: true,
    });
    const claims = await verifyGoogleToken(token, AUDIENCE, publicKey);
    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe("google-sub-123");
    expect(claims?.email).toBe("user@example.com");
  });

  it("rejects a token minted for a different audience", async () => {
    const token = await sign(
      { sub: "google-sub-123" },
      { audience: "https://some-other-service.example/endpoint" },
    );
    const claims = await verifyGoogleToken(token, AUDIENCE, publicKey);
    expect(claims).toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await sign({ sub: "google-sub-123" }, { expiresIn: "-1m" });
    const claims = await verifyGoogleToken(token, AUDIENCE, publicKey);
    expect(claims).toBeNull();
  });

  it("rejects a token with a bad signature", async () => {
    const token = await sign(
      { sub: "google-sub-123" },
      { key: otherPrivateKey },
    );
    const claims = await verifyGoogleToken(token, AUDIENCE, publicKey);
    expect(claims).toBeNull();
  });

  it("rejects a token from a non-Google issuer", async () => {
    const token = await new SignJWT({ sub: "google-sub-123" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://evil.example.com")
      .setAudience(AUDIENCE)
      .setSubject("google-sub-123")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const claims = await verifyGoogleToken(token, AUDIENCE, publicKey);
    expect(claims).toBeNull();
  });

  it("rejects a malformed token string", async () => {
    const claims = await verifyGoogleToken("not-a-jwt", AUDIENCE, publicKey);
    expect(claims).toBeNull();
  });
});

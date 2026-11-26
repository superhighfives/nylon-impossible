import { Cause, Effect, Exit, Layer, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../auth";
import { DatabaseError, RateLimitedError } from "../errors";
import { causeToClientError } from "../server-errors";
import { ENSURE_USER_ATTEMPTS, withAuthenticatedUser } from "../utils";

const limit = vi.fn();
vi.mock("cloudflare:workers", () => ({
  env: {
    DB: {},
    USER_RATE_LIMIT: { limit: (...args: unknown[]) => limit(...args) },
  },
}));

vi.mock("../db", () => ({ getDbClient: () => ({}) }));

const captureException = vi.fn();
vi.mock("@sentry/cloudflare", () => ({
  captureException: (...args: unknown[]) => captureException(...args),
}));

const ensureUserExists = vi.fn();
vi.mock("../auth", async () => {
  const { Context } = await import("effect");
  class AuthService extends Context.Tag("AuthService")<
    AuthService,
    { readonly getUser: Effect.Effect<{ id: string; email: string }> }
  >() {}
  return {
    AuthService,
    AuthServiceLive: undefined,
    ensureUserExists: (...args: unknown[]) => ensureUserExists(...args),
  };
});

const user = { id: "user_1", email: "a@example.com" };
const TestAuth = Layer.succeed(AuthService, {
  getUser: Effect.succeed(user),
} as never);

const dropped = () => new Error("D1_ERROR: Network connection lost.");

const run = <A, E>(callback: () => Effect.Effect<A, E>) =>
  Effect.runPromiseExit(
    withAuthenticatedUser(callback).pipe(Effect.provide(TestAuth)),
  );

describe("withAuthenticatedUser", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    ensureUserExists.mockReset();
    limit.mockReset();
    captureException.mockReset();
    limit.mockResolvedValue({ success: true });
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("retries ensureUserExists after a dropped D1 connection and runs the callback once", async () => {
    const error = dropped();
    ensureUserExists
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);
    const callback = vi.fn(() => Effect.succeed("board"));

    const exit = await run(callback);

    expect(exit).toEqual(Exit.succeed("board"));
    expect(ensureUserExists).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      `ensureUserExists attempt 1 of ${ENSURE_USER_ATTEMPTS} failed, retrying`,
      error,
    );
  });

  it("fails with DatabaseError carrying the last cause when every attempt fails", async () => {
    const errors = Array.from({ length: ENSURE_USER_ATTEMPTS }, dropped);
    for (const error of errors) ensureUserExists.mockRejectedValueOnce(error);
    const callback = vi.fn(() => Effect.succeed("board"));

    const exit = await run(callback);

    expect(Exit.isFailure(exit)).toBe(true);
    if (!Exit.isFailure(exit)) return;
    const failure = Option.getOrThrow(Cause.failureOption(exit.cause));
    expect(failure).toBeInstanceOf(DatabaseError);
    expect(failure).toMatchObject({
      _tag: "DatabaseError",
      operation: "ensureUserExists",
    });
    expect((failure as DatabaseError).cause).toBe(errors.at(-1));
    expect(ensureUserExists).toHaveBeenCalledTimes(3);
    expect(callback).not.toHaveBeenCalled();
    // The final failure goes to Sentry instead of a warning.
    expect(warn).toHaveBeenCalledTimes(ENSURE_USER_ATTEMPTS - 1);
  });

  it("fails with RateLimitedError over the user's limit, before D1 or the callback", async () => {
    limit.mockResolvedValue({ success: false });
    const callback = vi.fn(() => Effect.succeed("board"));

    const exit = await run(callback);

    expect(Exit.isFailure(exit)).toBe(true);
    if (!Exit.isFailure(exit)) return;
    const failure = Option.getOrThrow(Cause.failureOption(exit.cause));
    expect(failure).toBeInstanceOf(RateLimitedError);
    expect(limit).toHaveBeenCalledWith({ key: user.id });
    expect(ensureUserExists).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
    // What the client gets: the toast shows this message as it is.
    expect(causeToClientError(exit.cause)).toMatchObject({
      message: "Too many requests. Try again in a minute.",
      status: 429,
    });
  });

  it("lets the request through, and reports to Sentry, when the limiter itself fails", async () => {
    const error = new Error("rate limiter unavailable");
    limit.mockRejectedValue(error);
    ensureUserExists.mockResolvedValue(undefined);
    const callback = vi.fn(() => Effect.succeed("board"));

    const exit = await run(callback);

    expect(exit).toEqual(Exit.succeed("board"));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error, {
      tags: { area: "user-rate-limit" },
    });
  });

  it("counts every server function against the user's limit, keyed on their id", async () => {
    ensureUserExists.mockResolvedValue(undefined);
    await run(() => Effect.succeed("board"));
    expect(limit).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith({ key: "user_1" });
  });
});

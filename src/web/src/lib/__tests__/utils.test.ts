import { Cause, Effect, Exit, Layer, Option } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../auth";
import { DatabaseError } from "../errors";
import { ENSURE_USER_ATTEMPTS, withAuthenticatedUser } from "../utils";

vi.mock("cloudflare:workers", () => ({ env: { DB: {} } }));

vi.mock("../db", () => ({ getDbClient: () => ({}) }));

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
});

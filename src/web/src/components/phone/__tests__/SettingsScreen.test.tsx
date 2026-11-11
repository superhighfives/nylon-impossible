import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/helpers";

vi.mock("@clerk/tanstack-react-start", () => ({
  useAuth: () => ({ getToken: async () => "session-jwt", isSignedIn: true }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock("../../DevEnvironmentIndicator", () => ({
  useDevEnvironment: () => null,
}));
vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/toast")>()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

import { toast } from "@/lib/toast";
import { SettingsScreen } from "../SettingsScreen";

const TOKEN = `nyl_${"a".repeat(43)}`;
const NEW_TOKEN = `nyl_${"b".repeat(43)}`;
const USER = {
  id: "user_1",
  email: "sam@example.com",
  theme: "system",
  timezone: "UTC",
  timezoneAuto: true,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

type Info = { createdAt: string; lastUsedAt: string | null } | null;
let stored: Info;
let failNext: string | null;
let fetchMock: ReturnType<typeof vi.fn>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** The API token requests the screen made, as "METHOD path". */
const tokenRequests = () =>
  fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith("/users/me/api-token"))
    .map(([, init]) => (init as RequestInit | undefined)?.method ?? "GET");

beforeEach(() => {
  stored = null;
  failNext = null;
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer session-jwt",
    );
    if (path === "/users/me") return json(USER);
    if (path !== "/users/me/api-token") throw new Error(`unexpected ${path}`);
    if (failNext === method) return json({ error: "x", code: "x" }, 500);
    if (method === "GET") return json({ token: stored });
    if (method === "POST") {
      const token = stored ? NEW_TOKEN : TOKEN;
      stored = { createdAt: "2026-11-10T12:00:00.000Z", lastUsedAt: null };
      return json({ token, createdAt: stored.createdAt }, 201);
    }
    stored = null;
    return new Response(null, { status: 204 });
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderSettings(open = true) {
  const onClose = vi.fn();
  const view = renderWithProviders(
    <SettingsScreen open={open} onClose={onClose} />,
  );
  return {
    ...view,
    rerenderOpen: (next: boolean) =>
      view.rerender(<SettingsScreen open={next} onClose={onClose} />),
  };
}

/** Create token, once the token query has answered and enabled it. */
async function createButton() {
  const button = await screen.findByRole("button", { name: "Create token" });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe("SettingsScreen: API token", () => {
  it("with no token, offers Create token and says what it's for", async () => {
    renderSettings();
    await createButton();
    expect(
      screen.getByText(
        "Lets your own scripts read your lists and todos. It can’t change anything.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "API docs" })).toBeNull();
  });

  it("Create token posts, then shows the token once with Copy, a curl line and the docs link", async () => {
    renderSettings();
    fireEvent.click(await createButton());

    const field = await screen.findByRole("textbox", { name: "API token" });
    expect(field).toHaveValue(TOKEN);
    expect(field).toHaveAttribute("readonly");
    expect(tokenRequests()).toEqual(["GET", "POST"]);
    expect(
      screen.getByText("Copy it now. You won’t see it again."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        `curl -H "Authorization: Bearer ${TOKEN}" http://localhost:8787/v1/lists/today/todos`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "API docs" })).toHaveAttribute(
      "href",
      "/docs/api",
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(TOKEN);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Copied"));
  });

  it("closing Settings hides the token; reopening shows its dates instead", async () => {
    const { rerenderOpen } = renderSettings();
    fireEvent.click(await createButton());
    await screen.findByRole("textbox", { name: "API token" });

    rerenderOpen(false);
    rerenderOpen(true);
    expect(
      await screen.findByText("Created 10 Nov 2026 · Never used"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "API token" })).toBeNull();
    expect(screen.queryByText(new RegExp(TOKEN))).toBeNull();
  });

  it("with a token, shows when it was made and last used, with Regenerate, Revoke and the docs link", async () => {
    stored = {
      createdAt: "2026-11-03T12:00:00.000Z",
      lastUsedAt: "2026-11-05T12:00:00.000Z",
    };
    renderSettings();
    expect(
      await screen.findByText("Created 3 Nov 2026 · Last used 5 Nov"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Revoke" })).toHaveClass(
      "text-n-overdue",
    );
    expect(screen.getByRole("link", { name: "API docs" })).toHaveAttribute(
      "href",
      "/docs/api",
    );
    expect(screen.queryByRole("button", { name: "Create token" })).toBeNull();
  });

  it("says Never used for a token that hasn't been", async () => {
    stored = { createdAt: "2026-11-03T12:00:00.000Z", lastUsedAt: null };
    renderSettings();
    expect(
      await screen.findByText("Created 3 Nov 2026 · Never used"),
    ).toBeInTheDocument();
  });

  describe("Regenerate", () => {
    beforeEach(() => {
      stored = { createdAt: "2026-11-03T12:00:00.000Z", lastUsedAt: null };
    });

    it("asks first; cancelling sends nothing", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      renderSettings();
      fireEvent.click(
        await screen.findByRole("button", { name: "Regenerate" }),
      );
      expect(confirm).toHaveBeenCalledWith(
        "Regenerate your API token? Anything using the current one will stop working.",
      );
      expect(tokenRequests()).toEqual(["GET"]);
      expect(screen.getByRole("button", { name: "Regenerate" })).toBeEnabled();
    });

    it("confirming posts and shows the new token", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      renderSettings();
      fireEvent.click(
        await screen.findByRole("button", { name: "Regenerate" }),
      );
      expect(
        await screen.findByRole("textbox", { name: "API token" }),
      ).toHaveValue(NEW_TOKEN);
      expect(tokenRequests()).toEqual(["GET", "POST"]);
    });

    it("a failure shows the error toast", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      failNext = "POST";
      renderSettings();
      fireEvent.click(
        await screen.findByRole("button", { name: "Regenerate" }),
      );
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Couldn't regenerate token"),
      );
    });
  });

  describe("Revoke", () => {
    beforeEach(() => {
      stored = { createdAt: "2026-11-03T12:00:00.000Z", lastUsedAt: null };
    });

    it("asks first; cancelling sends nothing", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      renderSettings();
      fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
      expect(confirm).toHaveBeenCalledWith(
        "Revoke your API token? Anything using it will stop working.",
      );
      expect(tokenRequests()).toEqual(["GET"]);
    });

    it("confirming deletes it, toasts, and goes back to Create token", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      renderSettings();
      fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
      expect(
        await screen.findByRole("button", { name: "Create token" }),
      ).toBeInTheDocument();
      expect(tokenRequests()).toEqual(["GET", "DELETE"]);
      expect(toast.success).toHaveBeenCalledWith("Token revoked");
    });

    it("a failure shows the error toast and keeps the token", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      failNext = "DELETE";
      renderSettings();
      fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Couldn't revoke token"),
      );
      expect(
        screen.getByRole("button", { name: "Revoke" }),
      ).toBeInTheDocument();
    });
  });

  it("a failed create shows the error toast", async () => {
    failNext = "POST";
    renderSettings();
    fireEvent.click(await createButton());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't create token"),
    );
    await act(async () => {});
    expect(screen.queryByRole("textbox", { name: "API token" })).toBeNull();
  });

  it("doesn't ask for the token while Settings is closed", async () => {
    renderSettings(false);
    await act(async () => {});
    expect(tokenRequests()).toEqual([]);
  });
});

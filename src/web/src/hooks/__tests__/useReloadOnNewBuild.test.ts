import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUILD_CHECK_INTERVAL_MS,
  useReloadOnNewBuild,
} from "../useReloadOnNewBuild";

const reload = vi.fn();
const fetchMock = vi.fn();

function liveCommit(commit: string | null) {
  fetchMock.mockResolvedValue(Response.json({ commit }));
}

/** The tab comes back into view; settle the check it starts. */
async function show() {
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function later(ms = BUILD_CHECK_INTERVAL_MS) {
  vi.advanceTimersByTime(ms);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.stubEnv("VITE_COMMIT_SHA", "520071e");
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("location", { ...window.location, reload });
  liveCommit("4ac20a8");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  reload.mockReset();
  fetchMock.mockReset();
  document.body.innerHTML = "";
});

describe("useReloadOnNewBuild", () => {
  it("reloads when the tab is shown and a newer build is live", async () => {
    renderHook(() => useReloadOnNewBuild());
    later();
    await show();
    expect(fetchMock).toHaveBeenCalledWith("/version", { cache: "no-store" });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("checks on focus too", async () => {
    renderHook(() => useReloadOnNewBuild());
    later();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("doesn't reload over a focused field, and does next time it's shown", async () => {
    renderHook(() => useReloadOnNewBuild());
    const notes = document.createElement("textarea");
    document.body.appendChild(notes);
    notes.focus();
    later();
    await show();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();

    notes.blur();
    await show();
    expect(reload).toHaveBeenCalledTimes(1);
    // It already knows, so it doesn't ask again.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("doesn't reload over a focused input", async () => {
    renderHook(() => useReloadOnNewBuild());
    const title = document.createElement("input");
    document.body.appendChild(title);
    title.focus();
    later();
    await show();
    expect(reload).not.toHaveBeenCalled();
  });

  it("doesn't reload over a composer holding a draft", async () => {
    renderHook(() => useReloadOnNewBuild());
    document.body.innerHTML =
      "<form data-composer><textarea>Buy milk</textarea></form>";
    later();
    await show();
    expect(reload).not.toHaveBeenCalled();

    const field = document.querySelector("textarea");
    if (field) field.value = "";
    await show();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("doesn't reload while a toast offers Undo, and does once it's gone", async () => {
    renderHook(() => useReloadOnNewBuild());
    document.body.innerHTML =
      "<div>Done<button data-toast-action>Undo</button></div>";
    later();
    await show();
    expect(reload).not.toHaveBeenCalled();

    document.body.innerHTML = "";
    await show();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("checks at most once every 10 minutes", async () => {
    liveCommit("520071e");
    renderHook(() => useReloadOnNewBuild());
    // A freshly loaded tab is already current.
    await show();
    expect(fetchMock).not.toHaveBeenCalled();

    later();
    await show();
    await show();
    later(BUILD_CHECK_INTERVAL_MS - 1);
    await show();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    later(1);
    await show();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the commits match", async () => {
    liveCommit("520071e");
    renderHook(() => useReloadOnNewBuild());
    later();
    await show();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does nothing when the request fails", async () => {
    renderHook(() => useReloadOnNewBuild());
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    later();
    await show();
    fetchMock.mockResolvedValueOnce(
      new Response("Bad gateway", { status: 502 }),
    );
    later();
    await show();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does nothing when the live build has no commit", async () => {
    liveCommit(null);
    renderHook(() => useReloadOnNewBuild());
    later();
    await show();
    expect(reload).not.toHaveBeenCalled();
  });

  it("doesn't check while the tab is hidden", async () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    renderHook(() => useReloadOnNewBuild());
    later();
    await show();
    expect(fetchMock).not.toHaveBeenCalled();
    visibility.mockRestore();
  });

  it("never checks in local dev, where the bundle has no commit", async () => {
    vi.stubEnv("VITE_COMMIT_SHA", "");
    renderHook(() => useReloadOnNewBuild());
    later();
    await show();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("stops listening when unmounted", async () => {
    const { unmount } = renderHook(() => useReloadOnNewBuild());
    unmount();
    later();
    await show();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

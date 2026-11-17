import { useEffect } from "react";

/** How often a returning tab may ask which build is live. */
export const BUILD_CHECK_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Something is being edited: a focused field, or a composer holding a draft
 * that hasn't been added yet. Everything else already saved as it was typed
 * (Settled "Saving"), so a reload loses nothing.
 */
function isEditing(): boolean {
  const active = document.activeElement;
  if (active?.closest("input, textarea, select, [contenteditable]")) {
    return true;
  }
  return Array.from(
    document.querySelectorAll<HTMLTextAreaElement>("[data-composer] textarea"),
  ).some((field) => field.value.trim() !== "");
}

/**
 * Puts a tab left open across a deploy on the new build. When the tab comes
 * back into view (or regains focus), it asks the web worker which commit is
 * live (`GET /version`, at most once every 10 minutes) and, if that isn't the
 * commit this bundle was built from, reloads in place. It never reloads over
 * an edit: it waits for the next time the tab is shown. Local dev has no
 * commit, so it never checks. #691.
 */
export function useReloadOnNewBuild() {
  useEffect(() => {
    const bundleCommit = import.meta.env.VITE_COMMIT_SHA;
    if (!bundleCommit) return;

    let lastCheck = Date.now();
    let checking = false;
    let stale = false;

    const reloadIfIdle = () => {
      if (!isEditing()) window.location.reload();
    };

    const onShow = async () => {
      if (document.visibilityState !== "visible") return;
      if (stale) return reloadIfIdle();
      if (checking || Date.now() - lastCheck < BUILD_CHECK_INTERVAL_MS) return;
      checking = true;
      lastCheck = Date.now();
      try {
        const res = await fetch("/version", { cache: "no-store" });
        if (!res.ok) return;
        const { commit } = (await res.json()) as { commit?: unknown };
        if (typeof commit !== "string" || !commit || commit === bundleCommit) {
          return;
        }
        stale = true;
        reloadIfIdle();
      } catch {
        // Offline or mid-deploy: try again after the next interval.
      } finally {
        checking = false;
      }
    };

    const onEvent = () => void onShow();
    document.addEventListener("visibilitychange", onEvent);
    window.addEventListener("focus", onEvent);
    return () => {
      document.removeEventListener("visibilitychange", onEvent);
      window.removeEventListener("focus", onEvent);
    };
  }, []);
}

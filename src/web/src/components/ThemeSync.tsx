import { useEffect } from "react";
import { type Theme, useUser } from "@/hooks/useUser";

// Cookie holding the explicit light/dark/system preference. Written client-side
// so the server can read it during SSR (see getRootData in __root.tsx) and theme
// the HTML on first paint. "system" is resolved against the OS client hint.
export const THEME_STORAGE_KEY = "theme-preference";

// Address-bar colors per resolved scheme. Rendered into <meta name="theme-color">
// at SSR and kept live here on runtime theme changes.
export const THEME_COLOR = { light: "#fdfdf9", dark: "#14120b" } as const;

/**
 * Applies the user's synced appearance preference at runtime and mirrors it to a
 * cookie for SSR. "system" follows the OS and live-updates on change;
 * "light"/"dark" pin it. Rendered once, app-wide — falls back to "system" when
 * signed out or loading.
 */
export function ThemeSync() {
  const { data: user } = useUser();
  const theme: Theme = user?.theme ?? "system";

  useEffect(() => {
    // One year; sent on the next document request so SSR themes correctly.
    // biome-ignore lint/suspicious/noDocumentCookie: matches epic-web's own cookie writes; the async Cookie Store API isn't needed for a single sync write
    document.cookie = `${THEME_STORAGE_KEY}=${theme}; Max-Age=31536000; SameSite=Lax; Path=/`;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = theme === "dark" || (theme === "system" && mql.matches);
      document.documentElement.classList.toggle("dark", isDark);
      document.documentElement.classList.toggle("light", !isDark);
      // Recolor the browser address bar to match the resolved theme.
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute(
          "content",
          isDark ? THEME_COLOR.dark : THEME_COLOR.light,
        );
    };
    apply();

    // Only track the OS when following it; an explicit choice must not be
    // overridden when the system appearance changes.
    if (theme === "system") {
      mql.addEventListener("change", apply);
      return () => mql.removeEventListener("change", apply);
    }
  }, [theme]);

  return null;
}

import { createContext, type ReactNode, useContext } from "react";
import type { Hints } from "@/lib/client-hints";

// Server-resolved client hints (color scheme, time zone, reduced motion), made
// available app-wide so components render consistently on the server and client
// without a flash. Provided from the root loader; see __root.tsx.
// Matches the library's per-hint fallbacks, used when no provider is present
// (isolated component renders / tests). The app always supplies real values from
// the root loader, so this only affects rendering a component on its own.
const DEFAULT_HINTS: Hints = {
  colorScheme: "light",
  timeZone: "UTC",
  reducedMotion: "no-preference",
};

const HintsContext = createContext<Hints | null>(null);

export function HintsProvider({
  hints,
  children,
}: {
  hints: Hints;
  children: ReactNode;
}) {
  return (
    <HintsContext.Provider value={hints}>{children}</HintsContext.Provider>
  );
}

export function useHints(): Hints {
  return useContext(HintsContext) ?? DEFAULT_HINTS;
}

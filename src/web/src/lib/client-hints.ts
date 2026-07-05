import { getHintUtils } from "@epic-web/client-hints";
import { clientHint as colorSchemeHint } from "@epic-web/client-hints/color-scheme";
import { clientHint as reducedMotionHint } from "@epic-web/client-hints/reduced-motion";
import { clientHint as timeZoneHint } from "@epic-web/client-hints/time-zone";

// Cookie-based client hints (epic-web). The check script writes a cookie per
// hint from the browser, so the *server* knows these values on the very first
// render and can theme / format correctly without a flash. `getHints` reads the
// cookies from `document.cookie` on the client and from the request `Cookie`
// header on the server (pass the Request in loaders / server functions).
export const hintsUtils = getHintUtils({
  colorScheme: colorSchemeHint,
  timeZone: timeZoneHint,
  reducedMotion: reducedMotionHint,
});

export const { getHints } = hintsUtils;

export type Hints = ReturnType<typeof getHints>;

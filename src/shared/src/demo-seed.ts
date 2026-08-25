// Demo data for non-production environments. When one of these accounts
// first provisions in local dev or a preview, its freshly-created app is
// seeded with a realistic set of todos so it isn't an empty shell. Matched
// by Clerk email so callers don't need each account's dev-instance Clerk id.
// Shared between the API worker (src/api/src/lib/ensure-user.ts) and the web
// worker (src/web/src/lib/lists.ts) — each provisions users independently
// (web-only signups never touch the API), so this is the single place the
// data itself is defined to keep the two from drifting apart.
export const DEMO_SEED_EMAILS = new Set([
  "marketing@nylonimpossible.com",
  "hi@charliegleason.com",
]);

export type DemoSeedListKind = "today" | "thisWeek" | "sometime";

// A single attached link. `fetchStatus` defaults to "fetched" when a `title`
// is given, otherwise "pending" — set it explicitly to seed a failed fetch or
// a still-pending one with a title already present (shouldn't normally
// happen, but the UI needs to survive it).
export type DemoSeedUrl = {
  url: string;
  title?: string;
  description?: string;
  siteName?: string;
  favicon?: string;
  image?: string;
  showPreview?: boolean;
  fetchStatus?: "pending" | "fetched" | "failed";
};

export type DemoSeedTodo = {
  list: DemoSeedListKind;
  title: string;
  notes?: string;
  completed?: boolean;
  dueInDays?: number;
  urls?: DemoSeedUrl[];
};

export const DEMO_SEED_TODOS: DemoSeedTodo[] = [
  {
    list: "today",
    title: "Finish quarterly report",
    notes: "Needs sign-off from the finance team before end of month",
    dueInDays: 0,
  },
  { list: "today", title: "Buy groceries for the week", completed: true },
  {
    // URL-only todo (title === the raw URL) with a long fetched tweet body —
    // exercises the compact social card's wrapping with a long author name
    // and multi-line tweet text.
    list: "today",
    title: "https://x.com/ashishksingh/status/1881234567890123456",
    urls: [
      {
        url: "https://x.com/ashishksingh/status/1881234567890123456",
        title: "Ashishkumar Singh (@ashishksingh)",
        description:
          "Here is vanilla Opencode TUI running on purely Cloudflare Durable Objects. On a posix OS running inside a DO. There are patterns and anti-patterns when it comes to using DOs, but with the right architecture, I believe nothing truly is impossible with them. Eg, DOs have a 128 mb",
        siteName: "x.com",
        fetchStatus: "fetched",
      },
    ],
  },
  {
    // URL-only todo again — renders as just the bordered favicon+title chip,
    // no separate title line, with a title long enough to truncate.
    list: "today",
    title: "https://github.com/superhighfives/nylon-impossible/issues/482",
    urls: [
      {
        url: "https://github.com/superhighfives/nylon-impossible/issues/482",
        title:
          "iOS: recover instead of crashing when local storage is corrupted",
        siteName: "GitHub",
        favicon: "https://github.githubassets.com/favicons/favicon.svg",
        fetchStatus: "fetched",
      },
    ],
  },
  {
    // URL-only, still mid-fetch — exercises UrlPreviewCard's pending/loader
    // state instead of a title.
    list: "today",
    title: "https://x.com/mitchellh/status/2089111740395270615",
    urls: [{ url: "https://x.com/mitchellh/status/2089111740395270615" }],
  },
  { list: "thisWeek", title: "Book dentist appointment", dueInDays: 3 },
  { list: "thisWeek", title: "Reply to the design feedback thread" },
  {
    // Real title with two attached links, one of which overflows into the
    // "+1 link" summary.
    list: "thisWeek",
    title: "Prep the LLM-personalization demo",
    urls: [
      {
        url: "https://x.com/markphelps/status/1877654321098765432",
        title: "Mark Phelps (@markphelps)",
        description:
          "We live in wild times. Want to know anything about anything? Want it extremely personalized to you? Use this repo. Tell it to generate a tutorial, say 'how LLMs actually work, but use Go' https://t.co/5n7e9iAJ0T Then tell Opus to write code to turn that output into an epub",
        siteName: "x.com",
        fetchStatus: "fetched",
      },
      {
        url: "https://github.com/deverjarvis/lathe",
        title: "deverjarvis/lathe",
        description: "A tutorial generator for LLM-personalized epubs.",
        siteName: "GitHub",
        fetchStatus: "fetched",
      },
    ],
  },
  {
    // Fetch failed outright — no title/siteName ever came back, so the chip
    // falls back to the bare hostname.
    list: "thisWeek",
    title: "Check longforgottendomain.example",
    urls: [
      {
        url: "https://longforgottendomain.example/posts/why-this-404s",
        fetchStatus: "failed",
      },
    ],
  },
  {
    // Preview explicitly turned off — collapses to the raw-URL chip variant.
    list: "thisWeek",
    title: "Renew the domain before it lapses",
    urls: [
      {
        url: "https://www.namecheap.com/domains/registration/results/?domain=nylonimpossible.com",
        title: "Domain Registration - Namecheap",
        siteName: "namecheap.com",
        fetchStatus: "fetched",
        showPreview: false,
      },
    ],
  },
  { list: "sometime", title: "Read 'Atomic Habits'" },
  { list: "sometime", title: "Plan the autumn hiking trip" },
  {
    list: "sometime",
    title: "Watch this talk later",
    urls: [{ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }],
  },
];

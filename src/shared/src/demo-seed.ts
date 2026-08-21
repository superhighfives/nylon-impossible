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

export type DemoSeedTodo = {
  list: DemoSeedListKind;
  title: string;
  notes?: string;
  completed?: boolean;
  dueInDays?: number;
};

export const DEMO_SEED_TODOS: DemoSeedTodo[] = [
  {
    list: "today",
    title: "Finish quarterly report",
    notes: "Needs sign-off from the finance team before end of month",
    dueInDays: 0,
  },
  { list: "today", title: "Buy groceries for the week", completed: true },
  { list: "thisWeek", title: "Book dentist appointment", dueInDays: 3 },
  { list: "thisWeek", title: "Reply to the design feedback thread" },
  { list: "sometime", title: "Read 'Atomic Habits'" },
  { list: "sometime", title: "Plan the autumn hiking trip" },
];

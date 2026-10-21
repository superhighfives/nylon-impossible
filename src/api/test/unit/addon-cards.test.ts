import { describe, expect, it } from "vitest";
import {
  type AddonListOption,
  type AddonTodo,
  addonTodoMeta,
  buildContextualCard,
  buildHomepageCard,
  escapeCardText,
  orderAddonLists,
} from "../../src/lib/addon-cards";

// Tuesday 20 October 2026, mid-morning in Los Angeles.
const NOW = new Date("2026-10-20T17:00:00Z");
const TZ = "America/Los_Angeles";
const BASE = "https://api.example.com";
const WEB = "https://web.example.com";

const LISTS: AddonListOption[] = [
  { id: "studio", name: "Studio", systemKind: null },
  { id: "someday", name: "Someday", systemKind: "someday" },
  { id: "today", name: "Today", systemKind: "today" },
  { id: "week", name: "This Week", systemKind: "thisWeek" },
];

function todo(overrides: Partial<AddonTodo> = {}): AddonTodo {
  return {
    id: "t1",
    title: "Review PR",
    listId: "today",
    dueDate: null,
    pinned: false,
    repeats: false,
    ...overrides,
  };
}

const day = (key: string) => new Date(`${key}T00:00:00Z`);

describe("addonTodoMeta", () => {
  it.each([
    ["2026-10-17", "3 days overdue"],
    ["2026-10-19", "1 day overdue"],
    ["2026-10-20", "Today"],
    ["2026-10-21", "Tomorrow"],
    ["2026-10-23", "Fri"],
    ["2026-10-30", "Oct 30"],
  ])("labels a todo due %s as %s", (key, label) => {
    expect(addonTodoMeta(todo({ dueDate: day(key) }), NOW, TZ)).toBe(label);
  });

  it("joins Pinned, the due label and Repeat in the apps' order", () => {
    expect(
      addonTodoMeta(
        todo({ pinned: true, repeats: true, dueDate: day("2026-10-23") }),
        NOW,
        TZ,
      ),
    ).toBe("Pinned · Fri · Repeat");
  });

  it("has no meta line when nothing is set", () => {
    expect(addonTodoMeta(todo(), NOW, TZ)).toBeUndefined();
  });
});

describe("orderAddonLists", () => {
  it("puts the time lists first, then your lists in their order", () => {
    expect(orderAddonLists(LISTS).map((l) => l.name)).toEqual([
      "Today",
      "This Week",
      "Someday",
      "Studio",
    ]);
  });
});

describe("escapeCardText", () => {
  it("escapes the characters card HTML would interpret", () => {
    expect(escapeCardText("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });
});

describe("buildHomepageCard", () => {
  const card = buildHomepageCard(BASE, {
    lists: LISTS,
    todos: [
      todo({ id: "a", title: "Today one" }),
      todo({ id: "b", title: "Week one", listId: "week" }),
      todo({ id: "c", title: "Someday one", listId: "someday" }),
      todo({ id: "d", title: "Studio one", listId: "studio" }),
    ],
    webUrl: WEB,
    now: NOW,
    timeZone: TZ,
  });

  it("has the composer, then Today, This Week and Someday", () => {
    expect(card.header?.title).toBe("Nylon");
    expect(card.sections.map((s) => s.header)).toEqual([
      undefined,
      "Today",
      "This Week",
      "Someday",
    ]);
  });

  it("doesn't show your lists as rows", () => {
    expect(JSON.stringify(card)).not.toContain("Studio one");
  });

  it("collapses Someday to a count with a link", () => {
    const someday = card.sections[3].widgets[0].decoratedText;
    expect(someday?.text).toBe("1 todo");
    expect(someday?.button?.onClick.openLink?.url).toBe(WEB);
  });

  it("uses the Vocabulary, not the old words", () => {
    const json = JSON.stringify(card);
    for (const word of [/task/i, /Sometime/, /Completed/, /Sticky/]) {
      expect(json).not.toMatch(word);
    }
  });
});

describe("buildContextualCard", () => {
  const card = buildContextualCard(
    BASE,
    { subject: "Q3 planning", permalink: "https://mail.google.com/x" },
    LISTS,
  );

  it("titles the todo from the subject with the list dropdown on Today", () => {
    const [input, dropdown] = card.sections[0].widgets;
    expect(card.header?.title).toBe("Add to Nylon");
    expect(input.textInput?.value).toBe("Q3 planning");
    const selected = dropdown.selectionInput?.items.filter((i) => i.selected);
    expect(selected?.map((i) => i.text)).toEqual(["Today"]);
  });
});

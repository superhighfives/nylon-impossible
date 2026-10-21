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
  const input = (todos: AddonTodo[], lists = LISTS) => ({
    lists,
    todos,
    webUrl: WEB,
    now: NOW,
    timeZone: TZ,
  });
  const rows = (listId: string, n: number, prefix = listId) =>
    Array.from({ length: n }, (_, i) =>
      todo({ id: `${prefix}-${i}`, title: `${prefix} ${i}`, listId }),
    );
  const tickRows = (section: { widgets: { decoratedText?: object }[] }) =>
    section.widgets.filter(
      (w) => (w.decoratedText as { switchControl?: object })?.switchControl,
    );

  const card = buildHomepageCard(
    BASE,
    input([
      todo({ id: "a", title: "Today one" }),
      todo({ id: "b", title: "Week one", listId: "week" }),
      todo({ id: "c", title: "Someday one", listId: "someday" }),
      todo({ id: "d", title: "Studio one", listId: "studio" }),
    ]),
  );

  it("has the composer, Today, This Week, then Someday and your lists", () => {
    expect(card.header?.title).toBe("Nylon");
    expect(card.sections.map((s) => s.header)).toEqual([
      undefined,
      "Today",
      "This Week",
      "Someday · 1",
      "Studio · 1",
    ]);
  });

  it("leaves Today and This Week open", () => {
    expect(card.sections[1].collapsible).toBeUndefined();
    expect(card.sections[2].collapsible).toBeUndefined();
  });

  it("collapses Someday and each list to just the header, with tick rows inside", () => {
    for (const section of card.sections.slice(3)) {
      expect(section.collapsible).toBe(true);
      expect(section.uncollapsibleWidgetsCount).toBe(0);
    }
    const studio = card.sections[4];
    const row = studio.widgets[0].decoratedText;
    expect(row?.text).toBe("Studio one");
    expect(row?.switchControl?.onChangeAction.function).toBe(
      `${BASE}/gmail-addon/actions/toggle`,
    );
  });

  it("leaves out a list with no open todos", () => {
    const empty = buildHomepageCard(BASE, input([todo()]));
    expect(empty.sections.map((s) => s.header)).not.toContain("Studio · 0");
    // Someday always shows, with a written empty line.
    expect(empty.sections[3].header).toBe("Someday · 0");
    expect(empty.sections[3].widgets[0].textParagraph?.text).toBe(
      "Nothing in Someday.",
    );
  });

  it("caps a collapsed section at 8 rows, then links to the rest", () => {
    const big = buildHomepageCard(BASE, input(rows("studio", 11)));
    const studio = big.sections.find((s) => s.header === "Studio · 11");
    expect(studio && tickRows(studio)).toHaveLength(8);
    const more = studio?.widgets.at(-1)?.decoratedText;
    expect(more?.text).toBe("3 more in Studio");
    expect(more?.button?.onClick.openLink?.url).toBe(WEB);
  });

  it("shares one row budget across Someday and your lists", () => {
    const lists: AddonListOption[] = [
      ...LISTS.filter((l) => l.systemKind),
      ...["a", "b", "c", "d"].map((id) => ({
        id,
        name: id.toUpperCase(),
        systemKind: null,
      })),
    ];
    const big = buildHomepageCard(
      BASE,
      input(
        [
          ...rows("someday", 8),
          ...["a", "b", "c", "d"].flatMap((id) => rows(id, 8)),
        ],
        lists,
      ),
    );
    const shown = big.sections.slice(3).map((s) => tickRows(s).length);
    // 24 rows: Someday 8, A 8, B 8, then C and D only their overflow row.
    expect(shown).toEqual([8, 8, 8, 0, 0]);
    expect(big.sections.at(-1)?.widgets[0].decoratedText?.text).toBe(
      "8 more in D",
    );
  });

  it("caps the number of list sections and links to the rest", () => {
    const ids = Array.from({ length: 9 }, (_, i) => `l${i}`);
    const lists: AddonListOption[] = [
      ...LISTS.filter((l) => l.systemKind),
      ...ids.map((id) => ({ id, name: id, systemKind: null })),
    ];
    const big = buildHomepageCard(
      BASE,
      input(
        ids.map((id) => todo({ id, listId: id })),
        lists,
      ),
    );
    const listSections = big.sections.filter((s) => s.header?.match(/^l\d · /));
    expect(listSections).toHaveLength(6);
    const overflow = big.sections.at(-1)?.widgets[0].decoratedText;
    expect(overflow?.text).toBe("3 more lists");
    expect(overflow?.button?.onClick.openLink?.url).toBe(WEB);
  });

  it("stays well inside Google's card widget limit", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `l${i}`);
    const lists: AddonListOption[] = [
      ...LISTS.filter((l) => l.systemKind),
      ...ids.map((id) => ({ id, name: id, systemKind: null })),
    ];
    const worst = buildHomepageCard(
      BASE,
      input(
        [
          ...rows("today", 30),
          ...rows("week", 30),
          ...rows("someday", 30),
          ...ids.flatMap((id) => rows(id, 30)),
        ],
        lists,
      ),
    );
    const widgets = worst.sections.reduce((n, s) => n + s.widgets.length, 0);
    expect(widgets).toBeLessThanOrEqual(60);
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

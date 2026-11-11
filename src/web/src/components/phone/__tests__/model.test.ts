import { boardPath, boardUrl, parseBoardPath } from "@nylon-impossible/shared";
import { describe, expect, it } from "vitest";
import {
  boardViewKey,
  displayTitle,
  dueChipText,
  dueLabel,
  groupDoneByDay,
  mastheadSubline,
  metaSummary,
  openRows,
  planSubmit,
  rowMeta,
  splitLists,
  viewForKey,
} from "../model";
import { dueIn, makeList, makeTodo, makeUrl, NOW, TZ } from "./fixtures";

describe("dueLabel", () => {
  it.each([
    [0, "Today", false],
    [1, "Tomorrow", false],
    [5, "Fri", false],
    [12, "Oct 30", false],
    [-1, "1 day overdue", true],
    [-3, "3 days overdue", true],
  ])("%i days → %s", (n, text, overdue) => {
    expect(dueLabel(dueIn(n), NOW, TZ)).toEqual({ text, overdue });
  });

  it("counts days in the user's zone, not UTC", () => {
    // 01:00 UTC on the 19th is still the 18th in Los Angeles.
    const lateEvening = new Date("2026-10-19T01:00:00.000Z");
    expect(dueLabel(dueIn(0), lateEvening, TZ).text).toBe("Today");
  });
});

describe("rowMeta", () => {
  it("is empty for a plain todo", () => {
    expect(rowMeta(makeTodo(), [], NOW, TZ)).toEqual([]);
  });

  it("lists pin, due, repeat, subtasks, notes and link in spec order", () => {
    const todo = makeTodo({
      pinned: true,
      dueDate: dueIn(-4),
      recurrence: { frequency: "weekly" },
      notes: "Bring the passport photos",
      urls: [makeUrl()],
    });
    const subtasks = [
      makeTodo({ id: "s1", parentId: "todo-1", completed: true }),
      makeTodo({ id: "s2", parentId: "todo-1" }),
    ];
    const parts = rowMeta(todo, subtasks, NOW, TZ);
    expect(parts.map((p) => p.kind)).toEqual([
      "pin",
      "due",
      "repeat",
      "subtasks",
      "notes",
      "link",
    ]);
    expect(parts).toContainEqual({
      kind: "due",
      text: "4 days overdue",
      overdue: true,
    });
    expect(parts).toContainEqual({ kind: "subtasks", text: "1/2" });
    expect(parts).toContainEqual(
      expect.objectContaining({
        kind: "link",
        text: "visitlisboa.com",
        more: 0,
        fetching: false,
      }),
    );
    expect(metaSummary(parts)).toBe(
      "Pinned, 4 days overdue, Repeats weekly, 1/2 subtasks, Has notes, Link to visitlisboa.com",
    );
  });

  it("flags the link as fetching while its metadata is pending", () => {
    const url = makeUrl({ fetchStatus: "pending", title: null });
    const parts = rowMeta(makeTodo({ urls: [url] }), [], NOW, TZ);
    expect(parts).toContainEqual(
      expect.objectContaining({ kind: "link", fetching: true }),
    );
  });

  it("shows the first link's domain and how many more there are", () => {
    const todo = makeTodo({
      urls: [
        makeUrl({ id: "b", url: "https://example.com/b", position: "a1" }),
        makeUrl({ id: "a", position: "a0" }),
        makeUrl({ id: "c", url: "https://example.com/c", position: "a2" }),
      ],
    });
    const parts = rowMeta(todo, [], NOW, TZ);
    expect(parts).toContainEqual(
      expect.objectContaining({
        kind: "link",
        text: "visitlisboa.com",
        more: 2,
      }),
    );
    expect(metaSummary(parts)).toBe("Link to visitlisboa.com and 2 more");
  });

  it("takes the code-point first link, so Zz comes before a0", () => {
    const todo = makeTodo({
      urls: [
        makeUrl({ id: "a", position: "a0" }),
        makeUrl({ id: "z", url: "https://example.com/z", position: "Zz" }),
      ],
    });
    expect(rowMeta(todo, [], NOW, TZ)).toContainEqual(
      expect.objectContaining({ kind: "link", text: "example.com", more: 1 }),
    );
  });

  it("ignores whitespace-only notes", () => {
    expect(rowMeta(makeTodo({ notes: "  \n" }), [], NOW, TZ)).toEqual([]);
  });
});

describe("displayTitle", () => {
  it("shows the fetched title for a todo captured as a bare link", () => {
    const url = makeUrl({ url: "https://example.com/a" });
    expect(displayTitle(makeTodo({ title: url.url, urls: [url] }))).toBe(
      "Tram 28 — the complete guide",
    );
  });

  it("falls back to Check {domain} until the fetch lands", () => {
    const url = makeUrl({
      url: "https://example.com/a",
      fetchStatus: "pending",
      title: null,
    });
    expect(displayTitle(makeTodo({ title: url.url, urls: [url] }))).toBe(
      "Check example.com",
    );
  });

  it("strips an attached URL out of a real title", () => {
    const url = makeUrl({ url: "https://example.com/a" });
    expect(
      displayTitle(
        makeTodo({ title: "Read this https://example.com/a", urls: [url] }),
      ),
    ).toBe("Read this");
  });
});

describe("planSubmit", () => {
  const opts = { keepDateWords: false, now: NOW, timeZone: TZ };

  it("turns trailing date words into a due day", () => {
    const [todo] = planSubmit("Send invoice friday", opts);
    expect(todo.text).toBe("Send invoice");
    expect(todo.dueDay?.toISOString()).toBe(dueIn(5));
  });

  it("keeps the words when the chip was dismissed", () => {
    expect(
      planSubmit("Send invoice friday", { ...opts, keepDateWords: true }),
    ).toEqual([
      {
        text: "Send invoice friday",
        dueDay: null,
        line: "Send invoice friday",
      },
    ]);
  });

  it("leaves a mid-sentence weekday alone", () => {
    expect(planSubmit("Call Mum about Sunday lunch", opts)).toEqual([
      {
        text: "Call Mum about Sunday lunch",
        dueDay: null,
        line: "Call Mum about Sunday lunch",
      },
    ]);
  });

  it("adds one todo per non-empty line, each parsed", () => {
    const planned = planSubmit("Milk\n\n  Eggs tomorrow \nBread", opts);
    expect(planned.map((p) => p.text)).toEqual(["Milk", "Eggs", "Bread"]);
    expect(planned[1].dueDay?.toISOString()).toBe(dueIn(1));
    expect(planned[1].line).toBe("Eggs tomorrow");
  });

  it("passes an overlong line through whole for smart-create to split", () => {
    const long = "word ".repeat(150).trim();
    expect(planSubmit(long, opts)).toEqual([
      { text: long, dueDay: null, line: long },
    ]);
  });

  it("returns nothing for blank input", () => {
    expect(planSubmit(" \n ", opts)).toEqual([]);
  });
});

describe("dueChipText", () => {
  it("reads like the row label", () => {
    expect(dueChipText(new Date(dueIn(0)), NOW, TZ)).toBe("Today");
    expect(dueChipText(new Date(dueIn(5)), NOW, TZ)).toBe("Fri");
    expect(dueChipText(new Date(dueIn(12)), NOW, TZ)).toBe("Oct 30");
  });
});

describe("openRows", () => {
  it("keeps open top-level rows of one list, pinned first", () => {
    const todos = [
      makeTodo({ id: "a", position: "a0" }),
      makeTodo({ id: "b", position: "a1", pinned: true }),
      makeTodo({ id: "c", position: "a2", completed: true }),
      makeTodo({ id: "d", position: "a3", parentId: "a" }),
      makeTodo({ id: "e", position: "a4", listId: "other" }),
      makeTodo({ id: "f", position: "a5" }),
    ];
    expect(
      openRows(todos, "list-today", new Set(["f"])).map((t) => t.id),
    ).toEqual(["b", "a"]);
  });

  it("sorts each pinned tier by code point", () => {
    const todos = [
      makeTodo({ id: "a0", position: "a0" }),
      makeTodo({ id: "a0V", position: "a0V" }),
      makeTodo({ id: "Zz", position: "Zz" }),
      makeTodo({ id: "pa1", position: "a1", pinned: true }),
      makeTodo({ id: "pZy", position: "Zy", pinned: true }),
    ];
    expect(openRows(todos, "list-today", new Set()).map((t) => t.id)).toEqual([
      "pZy",
      "pa1",
      "Zz",
      "a0",
      "a0V",
    ]);
  });
});

describe("splitLists", () => {
  it("orders your lists by code point", () => {
    const { collections } = splitLists([
      makeList("a0", "Trips", null, "a0"),
      makeList("today", "Today", "today", "a1"),
      makeList("a0V", "Books", null, "a0V"),
      makeList("Zz", "Groceries", null, "Zz"),
    ]);
    expect(collections.map((l) => l.id)).toEqual(["Zz", "a0", "a0V"]);
  });
});

describe("groupDoneByDay", () => {
  it("groups finished todos newest first under Today / Yesterday / a date", () => {
    const groups = groupDoneByDay(
      [
        makeTodo({
          id: "a",
          completed: true,
          completedAt: "2026-10-18T16:00:00.000Z",
        }),
        makeTodo({
          id: "b",
          completed: true,
          completedAt: "2026-10-17T20:00:00.000Z",
        }),
        makeTodo({
          id: "c",
          completed: true,
          completedAt: "2026-10-12T20:00:00.000Z",
        }),
        makeTodo({ id: "d" }),
      ],
      NOW,
      TZ,
    );
    expect(groups.map((g) => [g.label, g.items.map((t) => t.id)])).toEqual([
      ["Today", ["a"]],
      ["Yesterday", ["b"]],
      ["Monday, October 12", ["c"]],
    ]);
  });
});

describe("mastheadSubline", () => {
  it("dates the time lists", () => {
    expect(mastheadSubline("today", 4, NOW, TZ)).toBe(
      "Sunday, October 18 · 4 todos",
    );
    expect(mastheadSubline("thisWeek", 1, NOW, TZ)).toBe(
      "Through Saturday, October 24 · 1 todo",
    );
    expect(mastheadSubline("lists", 2, NOW, TZ)).toBe("2 lists · never age");
    expect(mastheadSubline("done", 0, NOW, TZ)).toBe("Finished todos, by day");
  });
});

describe("board URLs", () => {
  const lists = [
    makeList("list-today", "Today", "today", "a0"),
    makeList("list-groceries", "Groceries", null, "a1"),
  ];

  it("parses the per-list paths", () => {
    expect(parseBoardPath("/")).toBeNull();
    expect(parseBoardPath("/this-week")).toEqual({ kind: "thisWeek" });
    expect(parseBoardPath("/someday/")).toEqual({ kind: "someday" });
    expect(parseBoardPath("/lists")).toEqual({ kind: "lists" });
    expect(parseBoardPath("/list/abc%20d")).toEqual({
      kind: "list",
      id: "abc d",
    });
    expect(parseBoardPath("/privacy")).toBeNull();
  });

  it("round-trips through boardPath", () => {
    for (const path of [
      "/today",
      "/this-week",
      "/someday",
      "/lists",
      "/list/x",
    ]) {
      const view = parseBoardPath(path);
      expect(view && boardPath(view)).toBe(path);
    }
    expect(boardUrl("https://nylon.test/", { kind: "list", id: "x" })).toBe(
      "https://nylon.test/list/x",
    );
  });

  it("keys a time list's id as that time list, and / as Today", () => {
    expect(boardViewKey(null, lists)).toBe("today");
    expect(boardViewKey({ kind: "list", id: "list-today" }, lists)).toBe(
      "today",
    );
    expect(boardViewKey({ kind: "list", id: "list-groceries" }, lists)).toBe(
      "list:list-groceries",
    );
    expect(viewForKey("list:list-groceries")).toEqual({
      kind: "list",
      id: "list-groceries",
    });
    expect(viewForKey("someday")).toEqual({ kind: "someday" });
    expect(viewForKey("lists")).toEqual({ kind: "lists" });
    expect(viewForKey("tomorrow")).toBeNull();
  });
});

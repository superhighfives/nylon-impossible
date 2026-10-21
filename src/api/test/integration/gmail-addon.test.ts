import { env, SELF } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { generateKeyPair, type JWTVerifyGetKey, SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { __setGoogleJwksForTest } from "../../src/lib/addon-auth";
import {
  getDb,
  gmailAddonLinks,
  lists,
  todos,
  todoUrls,
} from "../../src/lib/db";
import { mockGetUserList } from "../__mocks__/clerk-backend";
import { cleanDb, getTodayListId, seedTodo, seedUser } from "../helpers";

async function getTimeListId(
  kind: "thisWeek" | "someday",
  userId = "user_test_123",
) {
  const db = getDb(env.DB);
  const [list] = await db
    .select({ id: lists.id })
    .from(lists)
    .where(
      and(
        eq(lists.userId, userId),
        eq(lists.kind, "system"),
        eq(lists.systemKind, kind),
      ),
    );
  if (!list) throw new Error(`No ${kind} list seeded for user ${userId}`);
  return list.id;
}

const getSomedayListId = (userId?: string) => getTimeListId("someday", userId);

/** Midnight UTC `days` from now: the canonical stored form of a due day. */
function dueIn(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

const section = (card: any, header: string) =>
  card.sections.find((s: any) => s.header === header);

const rowTitles = (s: any) =>
  s.widgets
    .filter((w: any) => w.decoratedText?.switchControl)
    .map((w: any) => w.decoratedText.text);

const AUDIENCE = "https://api.nylonimpossible.com/gmail-addon";
const ISSUER = "https://accounts.google.com";
const GOOGLE_SUB = "google-sub-abc";

let privateKey: CryptoKey;
let publicKey: CryptoKey;

async function idToken(
  claims: Record<string, unknown> = {},
  opts: { audience?: string } = {},
): Promise<string> {
  return new SignJWT({
    email: "test@example.com",
    email_verified: true,
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
    .setSubject((claims.sub as string) ?? GOOGLE_SUB)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

async function post(
  path: string,
  token: string | null,
  body: unknown = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return SELF.fetch(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function linkUser(googleSub = GOOGLE_SUB, userId = "user_test_123") {
  const db = getDb(env.DB);
  await db
    .insert(gmailAddonLinks)
    .values({ googleSub, clerkUserId: userId, email: "test@example.com" })
    .onConflictDoNothing();
}

describe("Gmail add-on", () => {
  beforeAll(async () => {
    ({ privateKey, publicKey } = await generateKeyPair("RS256", {
      extractable: true,
    }));
    // Route the middleware's verification at our local key instead of Google.
    const resolver: JWTVerifyGetKey = async () => publicKey;
    __setGoogleJwksForTest(resolver);
  });

  afterAll(() => {
    __setGoogleJwksForTest(undefined);
  });

  beforeEach(async () => {
    await cleanDb();
    mockGetUserList.mockReset();
    mockGetUserList.mockResolvedValue({ data: [], totalCount: 0 });
    await seedUser();
  });

  describe("auth", () => {
    it("rejects a request with no bearer token", async () => {
      const res = await post("/gmail-addon/homepage", null);
      expect(res.status).toBe(401);
    });

    it("rejects a token minted for a different audience", async () => {
      const token = await idToken({}, { audience: "https://evil.example/x" });
      const res = await post("/gmail-addon/homepage", token);
      expect(res.status).toBe(401);
    });
  });

  describe("homepage", () => {
    it("returns a connect card when the Google identity is unlinked", async () => {
      const token = await idToken();
      const res = await post("/gmail-addon/homepage", token);
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      const card = body.action.navigations[0].pushCard;
      expect(card.header.title).toBe("Connect Nylon");
      const buttons = card.sections[0].widgets[1].buttonList.buttons;
      expect(buttons[0].onClick.openLink.url).toContain(
        "/connect/gmail-addon?state=",
      );
      // A refresh button re-invokes the add-on after linking in the browser.
      expect(buttons[1].onClick.action.function).toContain(
        "/gmail-addon/actions/refresh",
      );
    });

    it("auto-links by matching Google external account, then lists open todos", async () => {
      mockGetUserList.mockResolvedValue({
        data: [
          {
            id: "user_test_123",
            externalAccounts: [
              {
                provider: "oauth_google",
                providerUserId: GOOGLE_SUB,
                emailAddress: "test@example.com",
              },
            ],
          },
        ],
        totalCount: 1,
      });
      await seedTodo("11111111-1111-1111-1111-111111111111", "user_test_123", {
        title: "Open one",
        position: "a0",
      });

      const token = await idToken();
      const res = await post("/gmail-addon/homepage", token);
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      const card = body.action.navigations[0].pushCard;
      expect(card.header.title).toBe("Nylon");
      // A link row was recorded so future calls skip the Clerk lookup.
      const db = getDb(env.DB);
      const [link] = await db
        .select()
        .from(gmailAddonLinks)
        .where(eq(gmailAddonLinks.googleSub, GOOGLE_SUB));
      expect(link.clerkUserId).toBe("user_test_123");
      // The open todo appears under its list's own section header.
      const openSection = card.sections.find((s: any) => s.header === "Today");
      expect(openSection.widgets[0].decoratedText.text).toBe("Open one");
    });

    it("does not auto-link when the Google email is unverified", async () => {
      // A Clerk user with a matching Google account exists...
      mockGetUserList.mockResolvedValue({
        data: [
          {
            id: "user_test_123",
            externalAccounts: [
              {
                provider: "oauth_google",
                providerUserId: GOOGLE_SUB,
                emailAddress: "test@example.com",
              },
            ],
          },
        ],
        totalCount: 1,
      });
      // ...but the token's email isn't verified, so auto-link must not proceed.
      const token = await idToken({ email_verified: false });
      const res = await post("/gmail-addon/homepage", token);
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      expect(body.action.navigations[0].pushCard.header.title).toBe(
        "Connect Nylon",
      );
      const db = getDb(env.DB);
      const links = await db
        .select()
        .from(gmailAddonLinks)
        .where(eq(gmailAddonLinks.googleSub, GOOGLE_SUB));
      expect(links).toHaveLength(0);
    });

    it("lists only open top-level todos for a linked user", async () => {
      await linkUser();
      await seedTodo("22222222-2222-2222-2222-222222222222", "user_test_123", {
        title: "Still open",
        position: "a0",
      });
      await seedTodo("33333333-3333-3333-3333-333333333333", "user_test_123", {
        title: "Already done",
        completed: true,
        position: "a1",
      });

      const token = await idToken();
      const res = await post("/gmail-addon/homepage", token);
      const body = await res.json<any>();
      const card = body.action.navigations[0].pushCard;
      const openSection = card.sections.find((s: any) => s.header === "Today");
      expect(rowTitles(openSection)).toEqual(["Still open"]);
    });

    it("shows Today and This Week as rows and Someday as a count", async () => {
      await linkUser();
      const thisWeekId = await getTimeListId("thisWeek");
      const somedayId = await getSomedayListId();
      await seedTodo("66666666-6666-6666-6666-666666666666", "user_test_123", {
        title: "In Today",
        position: "a0",
      });
      await seedTodo("99999999-9999-9999-9999-999999999999", "user_test_123", {
        title: "In This Week",
        position: "a0",
        listId: thisWeekId,
      });
      for (const id of ["77777777", "77777778"]) {
        await seedTodo(`${id}-7777-7777-7777-777777777777`, "user_test_123", {
          title: "In Someday",
          position: "a0",
          listId: somedayId,
        });
      }

      const token = await idToken();
      const res = await post("/gmail-addon/homepage", token);
      const body = await res.json<any>();
      const card = body.action.navigations[0].pushCard;

      // Composer first, then the time sections; Someday collapsed with a count.
      expect(card.sections.map((s: any) => s.header)).toEqual([
        undefined,
        "Today",
        "This Week",
        "Someday · 2",
      ]);
      expect(rowTitles(section(card, "Today"))).toEqual(["In Today"]);
      expect(rowTitles(section(card, "This Week"))).toEqual(["In This Week"]);

      // Someday is collapsed to its header, with tick rows inside.
      const someday = section(card, "Someday · 2");
      expect(someday.collapsible).toBe(true);
      expect(someday.uncollapsibleWidgetsCount).toBe(0);
      expect(rowTitles(someday)).toEqual(["In Someday", "In Someday"]);

      // Rows tick to done through the toggle action.
      const row = section(card, "Today").widgets[0].decoratedText;
      expect(row.switchControl.controlType).toBe("CHECKBOX");
      expect(row.switchControl.onChangeAction.function).toContain(
        "/gmail-addon/actions/toggle",
      );
      expect(row.switchControl.onChangeAction.parameters).toEqual([
        { key: "todoId", value: "66666666-6666-6666-6666-666666666666" },
      ]);
    });

    it("orders the composer dropdown Today, This Week, Someday, then lists", async () => {
      await linkUser();
      const db = getDb(env.DB);
      // A list created before the time lists' positions still sorts after them.
      await db.insert(lists).values({
        id: "list-groceries",
        userId: "user_test_123",
        name: "Groceries",
        kind: "custom",
        position: "0",
      });

      const token = await idToken();
      const res = await post("/gmail-addon/homepage", token);
      const body = await res.json<any>();
      const card = body.action.navigations[0].pushCard;

      const listInput = card.sections[0].widgets[1].selectionInput;
      expect(listInput.items.map((i: any) => i.text)).toEqual([
        "Today",
        "This Week",
        "Someday",
        "Groceries",
      ]);
      const selected = listInput.items.filter((i: any) => i.selected);
      expect(selected.map((i: any) => i.text)).toEqual(["Today"]);
    });

    it("shows each list with open todos as a collapsed section, in order", async () => {
      await linkUser();
      const db = getDb(env.DB);
      await db.insert(lists).values([
        {
          id: "list-studio",
          userId: "user_test_123",
          name: "Studio",
          kind: "custom",
          position: "b1",
        },
        {
          id: "list-groceries",
          userId: "user_test_123",
          name: "Groceries",
          kind: "custom",
          position: "b0",
        },
        {
          id: "list-empty",
          userId: "user_test_123",
          name: "Empty",
          kind: "custom",
          position: "b2",
        },
      ]);
      await seedTodo("eeeeeeee-0000-0000-0000-000000000001", "user_test_123", {
        title: "Parmesan",
        listId: "list-groceries",
      });
      await seedTodo("eeeeeeee-0000-0000-0000-000000000002", "user_test_123", {
        title: "Mix the EP",
        listId: "list-studio",
      });

      const token = await idToken();
      const res = await post("/gmail-addon/homepage", token);
      const body = await res.json<any>();
      const card = body.action.navigations[0].pushCard;

      expect(card.sections.slice(3).map((s: any) => s.header)).toEqual([
        "Someday · 0",
        "Groceries · 1",
        "Studio · 1",
      ]);
      const groceries = section(card, "Groceries · 1");
      expect(groceries.collapsible).toBe(true);
      expect(rowTitles(groceries)).toEqual(["Parmesan"]);
      expect(
        groceries.widgets[0].decoratedText.switchControl.onChangeAction
          .function,
      ).toContain("/gmail-addon/actions/toggle");
    });

    it("labels due days the way the apps do", async () => {
      await linkUser();
      const rows: [string, Date | null, boolean][] = [
        ["Overdue", dueIn(-3), false],
        ["Due today", dueIn(0), false],
        ["Due tomorrow", dueIn(1), false],
        ["Pinned, no due", null, true],
      ];
      for (const [i, [title, dueDate, pinned]] of rows.entries()) {
        await seedTodo(
          `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb${i}`,
          "user_test_123",
          { title, dueDate, pinned, position: `a${i}` },
        );
      }

      const token = await idToken();
      const res = await post("/gmail-addon/homepage", token);
      const body = await res.json<any>();
      const card = body.action.navigations[0].pushCard;

      const labels = Object.fromEntries(
        section(card, "Today")
          .widgets.filter((w: any) => w.decoratedText?.switchControl)
          .map((w: any) => [
            w.decoratedText.text,
            w.decoratedText.bottomLabel ?? null,
          ]),
      );
      expect(labels).toEqual({
        Overdue: "3 days overdue",
        "Due today": "Today",
        "Due tomorrow": "Tomorrow",
        "Pinned, no due": "Pinned",
      });
    });

    it("writes the empty lines instead of leaving sections blank", async () => {
      await linkUser();
      const thisWeekId = await getTimeListId("thisWeek");
      await seedTodo("cccccccc-cccc-cccc-cccc-cccccccccccc", "user_test_123", {
        title: "Later",
        listId: thisWeekId,
      });

      const token = await idToken();
      const res = await post("/gmail-addon/homepage", token);
      const body = await res.json<any>();
      const card = body.action.navigations[0].pushCard;

      expect(section(card, "Today").widgets[0].textParagraph.text).toBe(
        "Nothing today. 1 waiting in This Week.",
      );
      expect(section(card, "Someday · 0").widgets[0].textParagraph.text).toBe(
        "Nothing in Someday.",
      );
    });

    it("escapes a title so it can't inject card markup", async () => {
      await linkUser();
      await seedTodo("dddddddd-dddd-dddd-dddd-dddddddddddd", "user_test_123", {
        title: "<b>Bold</b> & co",
      });

      const token = await idToken();
      const res = await post("/gmail-addon/homepage", token);
      const body = await res.json<any>();
      const card = body.action.navigations[0].pushCard;
      expect(rowTitles(section(card, "Today"))).toEqual([
        "&lt;b&gt;Bold&lt;/b&gt; &amp; co",
      ]);
    });

    it("caps a long Today and links to the rest", async () => {
      await linkUser();
      for (let i = 0; i < 12; i++) {
        const n = i.toString(16).padStart(2, "0");
        await seedTodo(
          `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa${n}`,
          "user_test_123",
          {
            title: `Today ${i}`,
            position: `a${n}`,
          },
        );
      }

      const token = await idToken();
      const res = await post("/gmail-addon/homepage", token);
      const body = await res.json<any>();
      const card = body.action.navigations[0].pushCard;

      const today = section(card, "Today");
      expect(rowTitles(today)).toHaveLength(8);
      const more = today.widgets.at(-1).decoratedText;
      expect(more.text).toBe("4 more in Today");
      expect(more.button.onClick.openLink.url).toMatch(/^https?:\/\//);
    });
  });

  describe("contextual", () => {
    it("pre-fills the card from the subject and carries the thread permalink", async () => {
      await linkUser();
      const token = await idToken();
      const res = await post("/gmail-addon/contextual", token, {
        gmail: {
          messageId: "m1",
          threadId: "thread-xyz",
          subject: "Reply to Sam",
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      const card = body.action.navigations[0].pushCard;
      expect(card.header.title).toBe("Add to Nylon");
      expect(card.sections[0].widgets[0].textInput.value).toBe("Reply to Sam");
      // The same list dropdown as the composer, defaulting to Today.
      const listInput = card.sections[0].widgets[1].selectionInput;
      expect(listInput.items.find((i: any) => i.selected).text).toBe("Today");
      expect(card.sections[0].widgets[2].textParagraph.text).toBe(
        "The email is attached as a link.",
      );
      const button = card.sections[0].widgets.at(-1).buttonList.buttons[0];
      expect(button.onClick.action.parameters).toEqual([
        {
          key: "permalink",
          value: "https://mail.google.com/mail/u/0/#all/thread-xyz",
        },
        { key: "subject", value: "Reply to Sam" },
      ]);
    });
  });

  describe("actions", () => {
    it("quick-add creates a todo through the smart-create path", async () => {
      await linkUser();
      const token = await idToken();
      const res = await post("/gmail-addon/actions/quick-add", token, {
        commonEventObject: {
          formInputs: {
            todoText: { stringInputs: { value: ["Buy stamps"] } },
          },
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      // Action responses update the card and flash a toast.
      expect(body.renderActions.action.notification.text).toBe(
        "Added to Today",
      );

      const db = getDb(env.DB);
      const rows = await db
        .select()
        .from(todos)
        .where(eq(todos.userId, "user_test_123"));
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Buy stamps");
    });

    it("quick-add runs the typed-date parser", async () => {
      await linkUser();
      const token = await idToken();
      const res = await post("/gmail-addon/actions/quick-add", token, {
        commonEventObject: {
          formInputs: {
            todoText: { stringInputs: { value: ["Buy stamps tomorrow"] } },
          },
        },
      });
      const body = await res.json<any>();
      expect(body.renderActions.action.notification.text).toBe(
        "Added to Today · due Tomorrow",
      );

      const [row] = await getDb(env.DB)
        .select()
        .from(todos)
        .where(eq(todos.userId, "user_test_123"));
      expect(row.title).toBe("Buy stamps");
      expect(row.dueDate).not.toBeNull();
    });

    it("quick-add places the todo in the selected list", async () => {
      await linkUser();
      const somedayId = await getSomedayListId();
      const token = await idToken();
      const res = await post("/gmail-addon/actions/quick-add", token, {
        commonEventObject: {
          formInputs: {
            todoText: { stringInputs: { value: ["Buy stamps"] } },
            listId: { stringInputs: { value: [somedayId] } },
          },
        },
      });
      expect(res.status).toBe(200);

      const db = getDb(env.DB);
      const [row] = await db
        .select()
        .from(todos)
        .where(eq(todos.userId, "user_test_123"));
      expect(row.listId).toBe(somedayId);
    });

    it("falls back to Today when the selected list isn't the user's own", async () => {
      await linkUser();
      await seedUser("user_other_456", "other@example.com");
      const otherSomedayId = await getSomedayListId("user_other_456");
      const token = await idToken();
      const res = await post("/gmail-addon/actions/quick-add", token, {
        commonEventObject: {
          formInputs: {
            todoText: { stringInputs: { value: ["Buy stamps"] } },
            listId: { stringInputs: { value: [otherSomedayId] } },
          },
        },
      });
      expect(res.status).toBe(200);

      const db = getDb(env.DB);
      const [row] = await db
        .select()
        .from(todos)
        .where(eq(todos.userId, "user_test_123"));
      const todayId = await getTodayListId();
      expect(row.listId).toBe(todayId);
    });

    it("rejects an over-length quick-add without creating a todo", async () => {
      await linkUser();
      const token = await idToken();
      const res = await post("/gmail-addon/actions/quick-add", token, {
        commonEventObject: {
          formInputs: {
            todoText: { stringInputs: { value: ["a".repeat(10001)] } },
          },
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      expect(body.renderActions.action.notification.text).toBe(
        "That todo is too long",
      );
      const db = getDb(env.DB);
      const rows = await db
        .select()
        .from(todos)
        .where(eq(todos.userId, "user_test_123"));
      expect(rows).toHaveLength(0);
    });

    it("normalizes a bare-string form input value instead of indexing a char", async () => {
      await linkUser();
      const token = await idToken();
      const res = await post("/gmail-addon/actions/quick-add", token, {
        commonEventObject: {
          formInputs: {
            // Google normally sends an array; a bare string must not become "B".
            todoText: { stringInputs: { value: "Bare string todo" } },
          },
        },
      });
      expect(res.status).toBe(200);
      const db = getDb(env.DB);
      const rows = await db
        .select()
        .from(todos)
        .where(eq(todos.userId, "user_test_123"));
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Bare string todo");
    });

    it("add-from-message attaches the permalink as the todo URL with the subject", async () => {
      await linkUser();
      const token = await idToken();
      const res = await post("/gmail-addon/actions/add-from-message", token, {
        commonEventObject: {
          formInputs: {
            todoText: { stringInputs: { value: ["Reply to Sam"] } },
          },
          parameters: {
            permalink: "https://mail.google.com/mail/u/0/#all/thread-xyz",
            subject: "Q3 planning notes",
          },
        },
      });
      expect(res.status).toBe(200);

      const db = getDb(env.DB);
      const [todo] = await db
        .select()
        .from(todos)
        .where(eq(todos.userId, "user_test_123"));
      expect(todo.title).toBe("Reply to Sam");
      const urls = await db
        .select()
        .from(todoUrls)
        .where(eq(todoUrls.todoId, todo.id));
      expect(urls).toHaveLength(1);
      expect(urls[0].url).toBe(
        "https://mail.google.com/mail/u/0/#all/thread-xyz",
      );
      // The subject rides through as the link's title/siteName, and the link is
      // stored already-settled so no doomed metadata fetch runs against Gmail.
      expect(urls[0].title).toBe("Q3 planning notes");
      expect(urls[0].siteName).toBe("Gmail");
      expect(urls[0].fetchStatus).toBe("fetched");
    });

    it("drops a non-http permalink instead of persisting a javascript: URL", async () => {
      await linkUser();
      const token = await idToken();
      const res = await post("/gmail-addon/actions/add-from-message", token, {
        commonEventObject: {
          formInputs: {
            todoText: { stringInputs: { value: ["Reply to Sam"] } },
          },
          // A caller-supplied permalink is untrusted input; a javascript: URL
          // must not reach a persisted, clickable todo URL.
          parameters: { permalink: "javascript:alert(document.cookie)" },
        },
      });
      expect(res.status).toBe(200);

      const db = getDb(env.DB);
      const [todo] = await db
        .select()
        .from(todos)
        .where(eq(todos.userId, "user_test_123"));
      expect(todo.title).toBe("Reply to Sam");
      const urls = await db
        .select()
        .from(todoUrls)
        .where(eq(todoUrls.todoId, todo.id));
      expect(urls).toHaveLength(0);
    });

    it("toggle marks an open todo complete", async () => {
      await linkUser();
      const todoId = "44444444-4444-4444-4444-444444444444";
      await seedTodo(todoId, "user_test_123", {
        title: "Tick me",
        completed: false,
      });

      const token = await idToken();
      const res = await post("/gmail-addon/actions/toggle", token, {
        commonEventObject: { parameters: { todoId } },
      });
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      expect(body.renderActions.action.notification.text).toBe("Done");

      const db = getDb(env.DB);
      const [todo] = await db.select().from(todos).where(eq(todos.id, todoId));
      expect(todo.completed).toBe(true);
    });

    it("add-from-message runs the typed-date parser and keeps mid-title words", async () => {
      await linkUser();
      const thisWeekId = await getTimeListId("thisWeek");
      const token = await idToken();
      for (const text of ["Reply to Sam tomorrow", "Ask about Sunday lunch"]) {
        await post("/gmail-addon/actions/add-from-message", token, {
          commonEventObject: {
            formInputs: {
              todoText: { stringInputs: { value: [text] } },
              listId: { stringInputs: { value: [thisWeekId] } },
            },
          },
        });
      }

      const rows = await getDb(env.DB)
        .select()
        .from(todos)
        .where(eq(todos.userId, "user_test_123"));
      const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
      expect(byTitle["Reply to Sam"].dueDate).not.toBeNull();
      // A weekday only counts at the end, so this stays a title.
      expect(byTitle["Ask about Sunday lunch"].dueDate).toBeNull();
      // The dropdown's list is honoured, as on the homepage composer.
      expect(rows.every((r) => r.listId === thisWeekId)).toBe(true);
    });

    it("toggle on a repeat says when it's next", async () => {
      await linkUser();
      const todoId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
      await seedTodo(todoId, "user_test_123", {
        title: "Water plants",
        dueDate: dueIn(0),
        recurrence: { frequency: "daily" },
      });

      const token = await idToken();
      const res = await post("/gmail-addon/actions/toggle", token, {
        commonEventObject: { parameters: { todoId } },
      });
      const body = await res.json<any>();
      expect(body.renderActions.action.notification.text).toBe(
        "Done · next Tomorrow",
      );
    });

    it("refresh re-shows the connect card when still unlinked", async () => {
      const token = await idToken();
      const res = await post("/gmail-addon/actions/refresh", token);
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      // Action responses update the current card in place.
      const card = body.renderActions.action.navigations[0].updateCard;
      expect(card.header.title).toBe("Connect Nylon");
    });

    it("refresh swaps in the homepage card once linked", async () => {
      await linkUser();
      await seedTodo("55555555-5555-5555-5555-555555555555", "user_test_123", {
        title: "Now visible",
        position: "a0",
      });

      const token = await idToken();
      const res = await post("/gmail-addon/actions/refresh", token);
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      const card = body.renderActions.action.navigations[0].updateCard;
      expect(card.header.title).toBe("Nylon");
      expect(body.renderActions.action.notification.text).toBe("Connected");
      const openSection = card.sections.find((s: any) => s.header === "Today");
      expect(openSection.widgets[0].decoratedText.text).toBe("Now visible");
    });
  });
});

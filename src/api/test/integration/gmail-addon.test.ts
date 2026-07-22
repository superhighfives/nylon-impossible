import { env, SELF } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { generateKeyPair, type JWTVerifyGetKey, SignJWT } from "jose";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { mockGetUserList } from "../__mocks__/clerk-backend";
import { __setGoogleJwksForTest } from "../../src/lib/addon-auth";
import { gmailAddonLinks, getDb, todos, todoUrls } from "../../src/lib/db";
import { cleanDb, seedTodo, seedUser } from "../helpers";

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
  const headers: Record<string, string> = { "Content-Type": "application/json" };
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
      const buttonUrl =
        card.sections[0].widgets[1].buttonList.buttons[0].onClick.openLink.url;
      expect(buttonUrl).toContain("/connect/gmail-addon?state=");
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
      // The open todo appears in the "Open todos" section.
      const openSection = card.sections.find(
        (s: any) => s.header === "Open todos",
      );
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
      const openSection = card.sections.find(
        (s: any) => s.header === "Open todos",
      );
      const titles = openSection.widgets.map(
        (w: any) => w.decoratedText.text,
      );
      expect(titles).toEqual(["Still open"]);
    });
  });

  describe("contextual", () => {
    it("pre-fills the card from the subject and carries the thread permalink", async () => {
      await linkUser();
      const token = await idToken();
      const res = await post("/gmail-addon/contextual", token, {
        gmail: { messageId: "m1", threadId: "thread-xyz", subject: "Reply to Sam" },
      });
      expect(res.status).toBe(200);
      const body = await res.json<any>();
      const card = body.action.navigations[0].pushCard;
      expect(card.header.title).toBe("Add to Nylon");
      expect(card.sections[0].widgets[0].textInput.value).toBe("Reply to Sam");
      const button = card.sections[0].widgets.at(-1).buttonList.buttons[0];
      expect(button.onClick.action.parameters[0]).toEqual({
        key: "permalink",
        value: "https://mail.google.com/mail/u/0/#all/thread-xyz",
      });
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
      expect(body.renderActions.action.notification.text).toBe("Added to Nylon");

      const db = getDb(env.DB);
      const rows = await db
        .select()
        .from(todos)
        .where(eq(todos.userId, "user_test_123"));
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe("Buy stamps");
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

    it("add-from-message attaches the permalink as the todo URL", async () => {
      await linkUser();
      const token = await idToken();
      const res = await post("/gmail-addon/actions/add-from-message", token, {
        commonEventObject: {
          formInputs: {
            todoText: { stringInputs: { value: ["Reply to Sam"] } },
          },
          parameters: {
            permalink: "https://mail.google.com/mail/u/0/#all/thread-xyz",
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
      expect(body.renderActions.action.notification.text).toBe("Marked done");

      const db = getDb(env.DB);
      const [todo] = await db.select().from(todos).where(eq(todos.id, todoId));
      expect(todo.completed).toBe(true);
    });
  });
});

import * as Sentry from "@sentry/cloudflare";
import { generateNKeysBetween } from "fractional-indexing";
import type { Context } from "hono";
import { enrichOrAskWithAI } from "../lib/ai-enrich";
import { clerkClient } from "../lib/clerk";
import { eq, getDb, todos, todoUrls, users } from "../lib/db";
import { extractUrlsFromText, truncateTitle } from "../lib/url-helpers";
import { fetchUrlMetadata } from "../lib/url-metadata";
import type { Env } from "../types";

/** A single task as returned by the Google Tasks REST API. */
interface GoogleTask {
  id: string;
  title?: string;
  notes?: string;
  status?: "needsAction" | "completed";
  due?: string;
  // Google's own ordering key within the list. Lexicographic sort matches
  // the order shown in the Google Tasks UI.
  position?: string;
}

// D1 caps bound parameters per statement (~100); each row binds ~10, so insert
// in small chunks to stay under the limit.
const INSERT_CHUNK_SIZE = 10;

/**
 * Fetch all incomplete tasks from the user's default Google Tasks list
 * ("My Tasks"), following pagination. Completed tasks are excluded so an
 * import only brings across open todos.
 */
async function fetchGoogleTasks(accessToken: string): Promise<GoogleTask[]> {
  const tasks: GoogleTask[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks",
    );
    url.searchParams.set("maxResults", "100");
    // Exclude completed tasks — the API returns them by default, and an import
    // should only bring across open todos.
    url.searchParams.set("showCompleted", "false");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Google Tasks API ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      items?: GoogleTask[];
      nextPageToken?: string;
    };
    if (json.items) tasks.push(...json.items);
    pageToken = json.nextPageToken;
  } while (pageToken);

  return tasks;
}

/**
 * Convert Google's date-only `due` value to a Date stored at noon UTC. Google
 * returns midnight UTC, which renders as the previous day in negative-offset
 * timezones; noon UTC keeps the calendar day stable everywhere.
 */
function parseGoogleDueDate(due: string | undefined): Date | null {
  if (!due) return null;
  const datePart = due.slice(0, 10); // YYYY-MM-DD
  const date = new Date(`${datePart}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// POST /todos/import/google-tasks
export async function importGoogleTasks(c: Context<Env>) {
  const userId = c.get("userId");
  // Free users always take the fast path regardless of their aiEnabled preference.
  const useAI = c.get("aiEnabled") && c.get("plan") === "pro";

  // Exchange the Clerk-held Google connection for an access token.
  let accessToken: string | undefined;
  try {
    const tokenResponse = await clerkClient(
      c.env,
    ).users.getUserOauthAccessToken(userId, "google");
    accessToken = tokenResponse.data[0]?.token;
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "google-tasks-import" } });
    return c.json(
      { error: "Couldn't reach your Google account. Try again." },
      502,
    );
  }

  if (!accessToken) {
    return c.json(
      { error: "Connect your Google account (with Tasks access) to import." },
      400,
    );
  }

  let googleTasks: GoogleTask[];
  try {
    googleTasks = await fetchGoogleTasks(accessToken);
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "google-tasks-import" } });
    return c.json(
      { error: "Couldn't fetch your Google Tasks. Try again." },
      502,
    );
  }

  if (googleTasks.length === 0) {
    return c.json({ imported: 0, skipped: 0, importedIds: [], datedTodos: [] });
  }

  const db = getDb(c.env.DB);

  // Skip tasks already imported (dedupe on googleTaskId), preserving Google's
  // display order for the rest.
  const existing = await db
    .select({ googleTaskId: todos.googleTaskId })
    .from(todos)
    .where(eq(todos.userId, userId));
  const importedIds = new Set(
    existing.map((row) => row.googleTaskId).filter(Boolean),
  );

  const toImport = googleTasks
    .filter((task) => !importedIds.has(task.id))
    .sort((a, b) => (a.position ?? "").localeCompare(b.position ?? ""));

  if (toImport.length === 0) {
    return c.json({
      imported: 0,
      skipped: googleTasks.length,
      importedIds: [],
      datedTodos: [],
    });
  }

  // Land imports above existing todos, in Google order (first task highest).
  const firstTodo = await db
    .select({ position: todos.position })
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(todos.position)
    .limit(1)
    .then((rows) => rows[0]);

  const positions = generateNKeysBetween(
    null,
    firstTodo?.position ?? null,
    toImport.length,
  );

  const now = new Date();
  const rows = toImport.map((task, index) => ({
    id: crypto.randomUUID(),
    userId,
    title: truncateTitle(task.title?.trim() || "Untitled"),
    notes: task.notes ? task.notes.slice(0, 10000) : null,
    completed: false,
    position: positions[index],
    dueDate: parseGoogleDueDate(task.due),
    googleTaskId: task.id,
    aiStatus: useAI ? ("pending" as const) : null,
    createdAt: now,
    updatedAt: now,
  }));

  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    await db.insert(todos).values(rows.slice(i, i + INSERT_CHUNK_SIZE));
  }

  // Enrich each imported todo the same way typed todos are. Pro + AI users get
  // full AI enrichment (research, URL metadata); everyone else gets URL
  // metadata so links still resolve to favicons/titles.
  const userLocation = useAI
    ? await db
        .select({ location: users.location })
        .from(users)
        .where(eq(users.id, userId))
        .then((r) => r[0]?.location)
    : undefined;

  for (const row of rows) {
    if (useAI) {
      c.executionCtx.waitUntil(
        enrichOrAskWithAI(
          db,
          c.env.AI,
          c.env,
          row.id,
          userId,
          row.title,
          userLocation,
          undefined,
          // The imported task already carries an authoritative due date from
          // Google — don't let AI extraction overwrite it, but pass it through
          // so an AI-inferred repeat schedule still has an anchor to attach to.
          { preserveExistingDueDate: true, existingDueDate: row.dueDate },
        ),
      );
    } else {
      const urls = extractUrlsFromText(`${row.title}\n${row.notes ?? ""}`);
      if (urls.length > 0) {
        c.executionCtx.waitUntil(
          fetchImportedUrlMetadata(db, row.id, urls, c.env, userId),
        );
      }
    }
  }

  await notifySync(c.env, userId);

  return c.json({
    imported: rows.length,
    skipped: googleTasks.length - rows.length,
    // IDs of every imported todo, so the client can briefly highlight the new
    // rows, plus the subset carrying a due date — the only ones that can hold a
    // repeat schedule, which the client offers to set in a review step.
    importedIds: rows.map((row) => row.id),
    datedTodos: rows
      .filter((row) => row.dueDate)
      .map((row) => ({
        id: row.id,
        title: row.title,
        dueDate: (row.dueDate as Date).toISOString(),
      })),
  });
}

/**
 * Insert URL records for an imported todo and fetch their metadata in the
 * background. Used for non-AI users, who don't go through enrichOrAskWithAI.
 */
async function fetchImportedUrlMetadata(
  db: ReturnType<typeof getDb>,
  todoId: string,
  urls: string[],
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
): Promise<void> {
  const now = new Date();
  const positions = generateNKeysBetween(null, null, urls.length);
  const records = urls.map((url, i) => ({
    id: crypto.randomUUID(),
    todoId,
    url,
    position: positions[i],
    fetchStatus: "pending" as const,
    createdAt: now,
    updatedAt: now,
  }));

  await db.insert(todoUrls).values(records);

  await Promise.allSettled(
    records.map(async (record) => {
      try {
        const metadata = await fetchUrlMetadata(record.url);
        await db
          .update(todoUrls)
          .set({
            title: metadata.title,
            description: metadata.description,
            siteName: metadata.siteName,
            favicon: metadata.favicon,
            image: metadata.image,
            fetchStatus: "fetched" as const,
            fetchedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(todoUrls.id, record.id));
      } catch (error) {
        Sentry.captureException(error, { tags: { area: "url-metadata" } });
        await db
          .update(todoUrls)
          .set({ fetchStatus: "failed" as const, updatedAt: new Date() })
          .where(eq(todoUrls.id, record.id));
      }
    }),
  );

  await notifySync(env, userId);
}

/** Notify all connected WebSocket clients for this user to sync. */
async function notifySync(
  env: { USER_SYNC: DurableObjectNamespace },
  userId: string,
): Promise<void> {
  try {
    const id = env.USER_SYNC.idFromName(userId);
    const stub = env.USER_SYNC.get(id);
    await stub.fetch(new Request("http://internal/notify", { method: "POST" }));
  } catch {
    // Non-critical - clients will sync on next poll
  }
}

// The public, read-only `/v1` API's contract: what a personal API token reads
// (#570). The API's `/v1` serializers return these types and the web's
// /docs/api page renders its examples from the ones below, so a field added
// here fails typecheck until both show it.
//
// `/v1` only grows. Fields and routes may be added; nothing is renamed or
// removed. A breaking change ships as `/v2`. Names follow the UI's words
// (PRINCIPLES.md Vocabulary), not the database's.

import type { RecurrenceFrequency } from "./schema";

/** Every personal API token starts with this, so a leaked one is easy to spot. */
export const API_TOKEN_PREFIX = "nyl_";

/** `nyl_` and 32 random bytes as unpadded base64url: 47 characters. */
export const API_TOKEN_PATTERN = /^nyl_[A-Za-z0-9_-]{43}$/;

export type V1ListKind = "today" | "this_week" | "someday" | "list";

/** `GET /v1/lists/:id` accepts these as well as a list's id. */
export const V1_LIST_ALIASES = ["today", "this-week", "someday"] as const;
export type V1ListAlias = (typeof V1_LIST_ALIASES)[number];

export interface V1List {
  id: string;
  name: string;
  kind: V1ListKind;
  updatedAt: string;
}

export interface V1Link {
  id: string;
  url: string;
  /** Null until the link's details have been fetched. */
  title: string | null;
  /** Null until the link's details have been fetched. */
  siteName: string | null;
  /** Show the bare URL rather than its title, as the apps do. */
  showAsUrl: boolean;
}

export interface V1Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface V1Todo {
  id: string;
  listId: string;
  title: string;
  notes: string | null;
  pinned: boolean;
  done: boolean;
  /** The day it's due, `YYYY-MM-DD`. */
  due: string | null;
  repeat: { frequency: RecurrenceFrequency } | null;
  links: V1Link[];
  subtasks: V1Subtask[];
  createdAt: string;
  updatedAt: string;
}

export interface V1ListsResponse {
  data: V1List[];
}

export interface V1TodosResponse {
  data: V1Todo[];
  nextCursor: string | null;
}

/** The error codes `/v1` can return, with their statuses. */
export const V1_ERRORS = {
  unauthorized: 401,
  validation_failed: 400,
  list_not_found: 404,
  todo_not_found: 404,
  rate_limited: 429,
} as const;
export type V1ErrorCode = keyof typeof V1_ERRORS;

export interface V1Error {
  error: string;
  code: V1ErrorCode;
}

/** `limit` on `/v1/lists/:id/todos`. */
export const V1_TODOS_DEFAULT_LIMIT = 100;
export const V1_TODOS_MAX_LIMIT = 500;

/** Requests a minute, per token. */
export const V1_RATE_LIMIT_PER_MINUTE = 60;

// Examples for the docs page. Every field is present, so the page shows the
// whole contract.

export const V1_LIST_EXAMPLE: V1List = {
  id: "8f14e45fceea167a5a36dedd4bea2543",
  name: "Today",
  kind: "today",
  updatedAt: "2026-11-02T09:00:00.000Z",
};

export const V1_TODO_EXAMPLE: V1Todo = {
  id: "0c9a3c4e-6f7b-4d1a-9a52-5b8f0e6f2d11",
  listId: "8f14e45fceea167a5a36dedd4bea2543",
  title: "Ship the public API",
  notes: "Docs first, then the token.",
  pinned: true,
  done: false,
  due: "2026-11-03",
  repeat: { frequency: "weekly" },
  links: [
    {
      id: "5d41402a-bc4b-4a76-b971-9d911017c592",
      url: "https://nylonimpossible.com/docs/api",
      title: "API",
      siteName: "Nylon Impossible",
      showAsUrl: false,
    },
  ],
  subtasks: [
    {
      id: "7d793037-a076-4c5c-8b0e-1c2c2b1c3a44",
      title: "Write tests",
      done: false,
    },
  ],
  createdAt: "2026-11-01T18:30:00.000Z",
  updatedAt: "2026-11-02T09:00:00.000Z",
};

import {
  V1_ERRORS,
  V1_LIST_EXAMPLE,
  V1_RATE_LIMIT_PER_MINUTE,
  V1_TODO_EXAMPLE,
  V1_TODOS_DEFAULT_LIMIT,
  V1_TODOS_MAX_LIMIT,
  type V1ErrorCode,
} from "@nylon-impossible/shared/api-v1";
import type { ReactNode } from "react";
import { LegalPage, LegalSection } from "./LegalPage";

const API_BASE = "https://api.nylonimpossible.com";

const CODE_BLOCK =
  "overflow-x-auto rounded-n-field bg-n-fill p-3 font-mono text-xs leading-relaxed text-n-ink";

/** Inline code. */
function C({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.8125rem]">{children}</code>;
}

const ROUTES: { path: string; returns: ReactNode }[] = [
  {
    path: "GET /v1/lists",
    returns: (
      <>
        <C>{"{ data: [List] }"}</C>: Today, This week, Someday, then your lists,
        in the apps’ order.
      </>
    ),
  },
  {
    path: "GET /v1/lists/:id",
    returns: <>One list.</>,
  },
  {
    path: "GET /v1/lists/:id/todos",
    returns: (
      <>
        <C>{"{ data: [Todo], nextCursor }"}</C>: the list’s todos that aren’t
        done, pinned first, in the apps’ order.
      </>
    ),
  },
  {
    path: "GET /v1/todos/:id",
    returns: <>One todo, done or not, with its subtasks inside it.</>,
  },
];

const ERROR_MEANINGS: Record<V1ErrorCode, string> = {
  unauthorized:
    "The token is missing, malformed, or was regenerated or revoked.",
  validation_failed: "A query parameter isn’t valid, such as limit=501.",
  list_not_found: "There’s no list of yours with that id.",
  todo_not_found: "There’s no todo of yours with that id.",
  rate_limited: "Over the rate limit. Wait for Retry-After seconds.",
};

/**
 * The public API's one docs page, at /docs/api. Its example JSON is the
 * shared `V1List` and `V1Todo` examples, so a field added to the contract
 * shows up here.
 */
export function ApiDocsPage() {
  return (
    <LegalPage title="API" lastUpdated="November 10, 2026">
      <p>
        Nylon’s API lets your own scripts read your lists and todos: a build
        step that shows your Today list on your site, say, or a small worker. It
        can only read.
      </p>

      <LegalSection heading="Authentication">
        <p>
          Make a token in Settings, under API token. Send it with every request:
        </p>
        <pre className={CODE_BLOCK}>Authorization: Bearer nyl_…</pre>
        <ul className="list-disc space-y-1 pl-5">
          <li>A token can only read. It can’t change anything.</li>
          <li>
            Keep it in a server, a build or a worker, never in page code.{" "}
            <C>/v1</C> doesn’t accept browser calls from other sites.
          </li>
          <li>
            It doesn’t expire. Regenerate or revoke it in Settings, and anything
            using the old one stops working.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Routes">
        <p>
          Every route is a <C>GET</C> on <C>{API_BASE}</C> and returns JSON.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {ROUTES.map((route) => (
            <li key={route.path}>
              <C>{route.path}</C>: {route.returns}
            </li>
          ))}
        </ul>
        <p>
          For a list’s <C>:id</C>, <C>today</C>, <C>this-week</C> and{" "}
          <C>someday</C> work too, so you don’t need to look their ids up.
        </p>
        <p>
          On <C>/v1/lists/:id/todos</C>, <C>?done=true</C> returns done todos
          instead, most recently changed first. <C>?limit=</C> sets the page
          size ({V1_TODOS_DEFAULT_LIMIT} by default, {V1_TODOS_MAX_LIMIT} at
          most). When there are more, pass the response’s <C>nextCursor</C> back
          as <C>?cursor=</C>; on the last page it’s <C>null</C>.
        </p>
        <pre className={CODE_BLOCK}>
          {`curl -H "Authorization: Bearer nyl_…" \\\n  ${API_BASE}/v1/lists/today/todos`}
        </pre>
      </LegalSection>

      <LegalSection heading="Responses">
        <p>A list:</p>
        <pre className={CODE_BLOCK}>
          {JSON.stringify(V1_LIST_EXAMPLE, null, 2)}
        </pre>
        <p>
          <C>kind</C> is <C>today</C>, <C>this_week</C>, <C>someday</C>, or{" "}
          <C>list</C> for your own lists.
        </p>
        <p>A todo:</p>
        <pre className={CODE_BLOCK}>
          {JSON.stringify(V1_TODO_EXAMPLE, null, 2)}
        </pre>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <C>due</C> is a day, <C>YYYY-MM-DD</C>, or <C>null</C>.
          </li>
          <li>
            <C>repeat</C> is <C>null</C>, or how often it repeats: <C>daily</C>,{" "}
            <C>weekly</C>, <C>monthly</C> or <C>yearly</C>. A repeating todo is
            never done: marking it done moves its due day on.
          </li>
          <li>
            <C>showAsUrl</C> means the apps show the link’s address rather than
            its title. <C>title</C> and <C>siteName</C> are <C>null</C> until
            the link’s details have been fetched.
          </li>
          <li>
            Subtasks come inside their todo, done ones included, in order.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="Rate limit">
        <p>
          {V1_RATE_LIMIT_PER_MINUTE} requests a minute per token. Over that, you
          get <C>429</C> with a <C>Retry-After</C> header.
        </p>
      </LegalSection>

      <LegalSection heading="Errors">
        <p>Errors come back as JSON with a message and a stable code:</p>
        <pre className={CODE_BLOCK}>
          {JSON.stringify({ error: "List not found", code: "list_not_found" })}
        </pre>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-n-hairline text-n-ink-muted">
              <th className="py-2 pr-4 font-medium">Code</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 font-medium">Meaning</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(V1_ERRORS) as V1ErrorCode[]).map((code) => (
              <tr key={code} className="border-b border-n-hairline align-top">
                <td className="py-2 pr-4">
                  <C>{code}</C>
                </td>
                <td className="py-2 pr-4">{V1_ERRORS[code]}</td>
                <td className="py-2">{ERROR_MEANINGS[code]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </LegalSection>

      <LegalSection heading="Versioning">
        <p>
          <C>/v1</C> only grows: new fields and routes may be added, and nothing
          is renamed or removed. A breaking change ships as <C>/v2</C>, with{" "}
          <C>/v1</C> kept running for at least 6 months and marked with a{" "}
          <C>Deprecation</C> header.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

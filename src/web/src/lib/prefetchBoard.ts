import type {
  FetchQueryOptions,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query";
import { listsQuery } from "@/hooks/useLists";
import { todosQuery } from "@/hooks/useTodos";

/**
 * Loads your lists and todos before the board renders, so the server draws
 * the board itself rather than its skeleton. A tab that reloads onto a new
 * build (#691) goes from one list to the next with nothing in between
 * (principle 8, #830). The router's query integration sends the cache to
 * the client with the page.
 *
 * Signed out, or when a fetch fails, it leaves that query out: the page
 * renders as it would with no data (the landing page, the skeleton, or the
 * board's error), and the hooks fetch again on the client. It never throws,
 * and never retries, so a failure doesn't hold up the page. In the browser
 * the cache already has both after the first load, so a move between the
 * board's routes fetches nothing here.
 */
export async function prefetchBoard(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    prefetch(queryClient, listsQuery),
    prefetch(queryClient, todosQuery),
  ]);
}

async function prefetch<T>(
  queryClient: QueryClient,
  options: FetchQueryOptions<T, Error, T, QueryKey>,
): Promise<void> {
  const { queryKey } = options;
  if (queryClient.getQueryData(queryKey) !== undefined) return;
  try {
    await queryClient.fetchQuery({ ...options, retry: false });
  } catch {
    const query = queryClient.getQueryCache().find({ queryKey, exact: true });
    // A failure would otherwise reach the client as the query's state.
    if (query && query.getObserversCount() === 0) {
      queryClient.removeQueries({ queryKey, exact: true });
    }
  }
}

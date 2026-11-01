import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SerializedList } from "@/types/database";
import { useCreateList } from "../useLists";

vi.mock("@/server/lists", () => ({
  getLists: vi.fn(),
  createList: vi.fn(),
  updateList: vi.fn(),
  deleteList: vi.fn(),
}));

vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocketSync: () => ({ notifyChanged: vi.fn() }),
}));

import * as serverLists from "@/server/lists";

const mockGetLists = vi.mocked(serverLists.getLists);
const mockCreateList = vi.mocked(serverLists.createList);

function makeList(overrides?: Partial<SerializedList>): SerializedList {
  return {
    id: "list-1",
    userId: "user-1",
    name: "Groceries",
    kind: "custom",
    systemKind: null,
    position: "a0",
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  }
  return { queryClient, Wrapper };
}

describe("useCreateList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // NYLON-IMPOSSIBLE-WEB-8: the caller opens the new list in its own
  // onSuccess. If the cache still held only the temp- row, the wide board
  // closed the "missing" list and looped through the URL until React bailed.
  it("swaps the optimistic row for the created list before the refetch lands", async () => {
    const existing = makeList({ id: "list-existing", name: "Work" });
    const created = makeList({ id: "list-new", name: "Groceries" });
    const { queryClient, Wrapper } = createWrapper();
    queryClient.setQueryData<SerializedList[]>(["lists"], [existing]);
    mockCreateList.mockResolvedValue(created);
    // The invalidation refetch never lands, so only onSuccess can put the
    // real list in the cache.
    mockGetLists.mockReturnValue(new Promise(() => {}));

    let seenByCaller: SerializedList[] | undefined;
    const { result } = renderHook(() => useCreateList(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync(
        { name: "Groceries" },
        {
          onSuccess: () => {
            seenByCaller = queryClient.getQueryData<SerializedList[]>([
              "lists",
            ]);
          },
        },
      );
    });

    expect(seenByCaller?.map((l) => l.id)).toEqual([
      "list-existing",
      "list-new",
    ]);
    const cached = queryClient.getQueryData<SerializedList[]>(["lists"]);
    expect(cached?.map((l) => l.id)).toEqual(["list-existing", "list-new"]);
    expect(cached?.some((l) => l.id.startsWith("temp-"))).toBe(false);
  });

  it("puts the previous lists back when creating fails", async () => {
    const existing = makeList({ id: "list-existing" });
    const { queryClient, Wrapper } = createWrapper();
    queryClient.setQueryData<SerializedList[]>(["lists"], [existing]);
    mockCreateList.mockRejectedValue(new Error("nope"));
    mockGetLists.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useCreateList(), { wrapper: Wrapper });
    await act(async () => {
      await result.current.mutateAsync({ name: "Groceries" }).catch(() => {});
    });

    await waitFor(() =>
      expect(
        queryClient.getQueryData<SerializedList[]>(["lists"])?.map((l) => l.id),
      ).toEqual(["list-existing"]),
    );
  });
});

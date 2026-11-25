import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/lib/toast";
import type { SerializedList } from "@/types/database";
import {
  useCreateList,
  useDeleteList,
  useReorderLists,
  useUpdateList,
} from "../useLists";

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
const mockUpdateList = vi.mocked(serverLists.updateList);
const mockDeleteList = vi.mocked(serverLists.deleteList);

function makeList(overrides?: Partial<SerializedList>): SerializedList {
  return {
    id: "list-1",
    userId: "user-1",
    name: "Groceries",
    kind: "custom",
    systemKind: null,
    position: "a0",
    columnHidden: false,
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

describe("useUpdateList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The column leaves the board at once, before the server answers.
  it("hides a list's column in the cache straight away", async () => {
    const list = makeList({ id: "list-vinyl" });
    const { queryClient, Wrapper } = createWrapper();
    queryClient.setQueryData<SerializedList[]>(["lists"], [list]);
    mockUpdateList.mockReturnValue(new Promise(() => {}));
    mockGetLists.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useUpdateList(), { wrapper: Wrapper });
    act(() => {
      result.current.mutate({
        id: "list-vinyl",
        input: { columnHidden: true },
      });
    });

    await waitFor(() =>
      expect(
        queryClient.getQueryData<SerializedList[]>(["lists"])?.[0].columnHidden,
      ).toBe(true),
    );
    expect(mockUpdateList).toHaveBeenCalledWith({
      data: { id: "list-vinyl", input: { columnHidden: true } },
    });
  });
});

describe("failure toasts", () => {
  const SERVER_ERROR = new Error("Request failed (500)");

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLists.mockReturnValue(new Promise(() => {}));
  });

  async function failWith(run: () => Promise<unknown>) {
    const error = vi.spyOn(toast, "error");
    await act(async () => {
      await run().catch(() => {});
    });
    const shown = error.mock.calls.map(([message]) => message);
    error.mockRestore();
    return shown;
  }

  it("creating a list says the apps' sentence, not the server's", async () => {
    mockCreateList.mockRejectedValue(SERVER_ERROR);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateList(), { wrapper: Wrapper });
    expect(
      await failWith(() => result.current.mutateAsync({ name: "Groceries" })),
    ).toEqual(["Couldn’t create the list"]);
  });

  it.each([
    [{ name: "Errands" }, "Couldn’t rename the list"],
    [{ position: "a5" }, "Couldn’t save the new order"],
    [{ columnHidden: true }, "Couldn’t save that change"],
  ])("updating %o names what was tried", async (input, message) => {
    mockUpdateList.mockRejectedValue(SERVER_ERROR);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateList(), { wrapper: Wrapper });
    expect(
      await failWith(() => result.current.mutateAsync({ id: "list-1", input })),
    ).toEqual([message]);
  });

  it("deleting a list says the apps' sentence, not the server's", async () => {
    mockDeleteList.mockRejectedValue(SERVER_ERROR);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useDeleteList(), { wrapper: Wrapper });
    expect(await failWith(() => result.current.mutateAsync("list-1"))).toEqual([
      "Couldn’t delete the list",
    ]);
  });
});

describe("useReorderLists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const three = () => [
    makeList({ id: "a", position: "a0" }),
    makeList({ id: "b", position: "a1" }),
    makeList({ id: "c", position: "a2" }),
  ];
  const order = (lists: SerializedList[] | undefined) =>
    [...(lists ?? [])]
      .sort((x, y) => (x.position < y.position ? -1 : 1))
      .map((l) => l.id);

  it("writes the new order into the cache at once, and saves each position", async () => {
    const { queryClient, Wrapper } = createWrapper();
    queryClient.setQueryData<SerializedList[]>(["lists"], three());
    mockUpdateList.mockResolvedValue(makeList());
    mockGetLists.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useReorderLists(), {
      wrapper: Wrapper,
    });

    act(() => result.current([{ id: "c", position: "Zz" }]));
    // Before the request returns.
    expect(order(queryClient.getQueryData(["lists"]))).toEqual(["c", "a", "b"]);
    await waitFor(() =>
      expect(mockUpdateList).toHaveBeenCalledWith({
        data: { id: "c", input: { position: "Zz" } },
      }),
    );
  });

  it("puts the old order back and says so when the save fails", async () => {
    const { queryClient, Wrapper } = createWrapper();
    queryClient.setQueryData<SerializedList[]>(["lists"], three());
    mockUpdateList.mockRejectedValue(new Error("boom"));
    mockGetLists.mockReturnValue(new Promise(() => {}));
    const error = vi.spyOn(toast, "error");
    const { result } = renderHook(() => useReorderLists(), {
      wrapper: Wrapper,
    });

    act(() => result.current([{ id: "c", position: "Zz" }]));
    await waitFor(() =>
      expect(order(queryClient.getQueryData(["lists"]))).toEqual([
        "a",
        "b",
        "c",
      ]),
    );
    expect(error).toHaveBeenCalledWith("Couldn’t save the new order");
    error.mockRestore();
  });
});

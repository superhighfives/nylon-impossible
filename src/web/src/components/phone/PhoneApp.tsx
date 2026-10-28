import type { BoardView } from "@nylon-impossible/shared";
import { generateKeyBetween } from "fractional-indexing";
import { ArrowRight, ChevronRight, Plus } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useHints } from "@/hooks/useHints";
import { useCreateList } from "@/hooks/useLists";
import type { TodoWithUrls } from "@/types/database";
import { FeedbackDialog, useCanSendFeedback } from "../FeedbackDialog";
import { AccountSheet } from "./AccountSheet";
import { Composer } from "./Composer";
import { ContextMenu } from "./ContextMenu";
import { DetailSheet } from "./DetailSheet";
import { DoneScreen } from "./DoneScreen";
import { BackButton, Masthead } from "./Masthead";
import {
  boardViewKey,
  mastheadSubline,
  PAGES,
  type PageKey,
  plural,
  TIME_KINDS,
  viewForKey,
} from "./model";
import { OvernightNote, useOvernightNote } from "./OvernightNote";
import { SettingsScreen } from "./SettingsScreen";
import { TodoRow } from "./TodoRow";
import { useBoardData } from "./useBoardData";

const EMPTY: TodoWithUrls[] = [];

/** The pager page a view opens on: a time list, or Lists for any list. */
function pageForView(view: BoardView | null | undefined): number {
  if (!view) return 0;
  if (view.kind === "list") return 3;
  const index = PAGES.findIndex((p) => p.key === view.kind);
  return index < 0 ? 0 : index;
}

/**
 * The phone layout (web under 1024px): the Today · This week · Someday ·
 * Lists switcher, horizontally paged lists, the keyboard-attached composer,
 * and the detail sheet, context menu, Done history and Settings above them.
 * Data comes from `useBoardData`, shared with the wide layout.
 */
export function PhoneApp({
  view = null,
  onNavigate,
}: {
  /** The view the URL names (`/this-week`, `/list/:id`); null is Today. */
  view?: BoardView | null;
  /** Keeps the URL in step as you page and open lists. */
  onNavigate?: (view: BoardView | null) => void;
} = {}) {
  const { reducedMotion } = useHints();
  const {
    timeZone,
    lists,
    todos,
    byKind,
    collections,
    listName,
    actions,
    subtasksOf,
    rowsFor,
    targets,
    doneCount,
    loading,
    todosLoading,
    error,
    refetch,
    isFetching,
  } = useBoardData();
  const createList = useCreateList();

  const [pageIndex, setPageIndex] = useState(() => pageForView(view));
  const [collectionId, setCollectionId] = useState<string | null>(() =>
    view?.kind === "list" ? view.id : null,
  );
  const [detailId, setDetailId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [account, setAccount] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const canSendFeedback = useCanSendFeedback();
  const [screen, setScreen] = useState<"done" | "settings" | null>(null);
  const [newList, setNewList] = useState("");

  const pagerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const now = new Date();
  const overnight = useOvernightNote(todos, byKind.today?.id);

  const page = PAGES[pageIndex]?.key ?? "today";
  const currentListId =
    page === "lists"
      ? collectionId
      : (byKind[page as (typeof TIME_KINDS)[number]]?.id ?? null);

  // --- Paging ---------------------------------------------------------------

  /** Slide the switcher's yellow underline under the title at `position`. */
  const placeIndicator = useCallback((position: number) => {
    const nav = navRef.current;
    const bar = indicatorRef.current;
    if (!nav || !bar) return;
    const buttons = nav.querySelectorAll<HTMLElement>("[data-page-button]");
    const lo = Math.max(0, Math.min(buttons.length - 1, Math.floor(position)));
    const hi = Math.min(buttons.length - 1, lo + 1);
    const t = position - lo;
    const a = buttons[lo];
    const b = buttons[hi];
    if (!a || !b) return;
    const left = a.offsetLeft + (b.offsetLeft - a.offsetLeft) * t;
    const width = a.offsetWidth + (b.offsetWidth - a.offsetWidth) * t;
    bar.style.transform = `translateX(${left}px)`;
    bar.style.width = `${width}px`;
  }, []);

  useLayoutEffect(() => {
    placeIndicator(pageIndex);
  }, [pageIndex, placeIndicator]);

  // Open on the URL's page without animating to it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: first paint only
  useLayoutEffect(() => {
    const pager = pagerRef.current;
    if (pager) pager.scrollLeft = pageIndex * pager.clientWidth;
  }, []);

  useEffect(() => {
    const onResize = () => {
      const pager = pagerRef.current;
      if (pager) pager.scrollLeft = pageIndex * pager.clientWidth;
      placeIndicator(pageIndex);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pageIndex, placeIndicator]);

  const onPagerScroll = () => {
    const pager = pagerRef.current;
    if (!pager || pager.clientWidth === 0) return;
    const position = pager.scrollLeft / pager.clientWidth;
    placeIndicator(position);
    const settled = Math.round(position);
    if (Math.abs(position - settled) < 0.02 && settled !== pageIndex) {
      setPageIndex(settled);
    }
  };

  const goTo = useCallback(
    (index: number) => {
      const pager = pagerRef.current;
      setPageIndex(index);
      if (!pager) return;
      pager.scrollTo({
        left: index * pager.clientWidth,
        behavior: reducedMotion === "reduce" ? "auto" : "smooth",
      });
    },
    [reducedMotion],
  );

  const goToList = useCallback(
    (listId: string) => {
      const kind = lists?.find((l) => l.id === listId)?.systemKind;
      if (kind) {
        goTo(TIME_KINDS.indexOf(kind));
        return;
      }
      setCollectionId(listId);
      goTo(3);
    },
    [goTo, lists],
  );

  // --- URL -----------------------------------------------------------------
  // The URL and the pager agree on one key ("thisWeek", "list:<id>"). A new
  // URL (back/forward, a pasted link, or lists loading and resolving a time
  // list's id) moves the pager; paging or opening a list rewrites the URL.

  const urlKey = boardViewKey(view, lists);
  const stateKey =
    page === "lists" ? (collectionId ? `list:${collectionId}` : "lists") : page;
  const syncedKey = useRef(urlKey);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the URL changes
  useEffect(() => {
    if (urlKey === syncedKey.current) return;
    syncedKey.current = urlKey;
    if (urlKey.startsWith("list:")) {
      setCollectionId(urlKey.slice(5));
      goTo(3);
      return;
    }
    // A `/list/<id>` that turned out to be a time list seeded collectionId;
    // drop it, or the Lists tab would reopen the time list as a collection.
    const seededKind = lists?.find((l) => l.id === collectionId)?.systemKind;
    if (urlKey === "lists" || seededKind) setCollectionId(null);
    goTo(
      Math.max(
        0,
        PAGES.findIndex((p) => p.key === urlKey),
      ),
    );
  }, [urlKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the view changes
  useEffect(() => {
    if (stateKey === syncedKey.current) return;
    syncedKey.current = stateKey;
    const next = viewForKey(stateKey);
    if (next) onNavigate?.(next);
  }, [stateKey]);

  const onNavKey = (e: KeyboardEvent<HTMLElement>) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? PAGES.length - 1
          : pageIndex + delta;
    if (
      (delta === 0 && e.key !== "Home" && e.key !== "End") ||
      to < 0 ||
      to >= PAGES.length
    ) {
      return;
    }
    e.preventDefault();
    goTo(to);
    navRef.current
      ?.querySelectorAll<HTMLElement>("[data-page-button]")
      [to]?.focus();
  };

  // `n` focuses the composer, as on the wide board.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "n" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (
        el?.closest("input, textarea, select, [contenteditable], [role=dialog]")
      ) {
        return;
      }
      if (!composerRef.current) return;
      e.preventDefault();
      composerRef.current.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- Derived overlays -----------------------------------------------------

  const detailTodo = detailId
    ? (todos.find((t) => t.id === detailId && !t.completed) ?? null)
    : null;
  const menuTodo = menuId ? (todos.find((t) => t.id === menuId) ?? null) : null;

  // Close the detail if its todo goes away (deleted elsewhere, or done).
  useEffect(() => {
    if (detailId && !todosLoading && !detailTodo) setDetailId(null);
  }, [detailId, detailTodo, todosLoading]);

  const renderRows = (listId: string | undefined, emptyFor: PageKey | null) => {
    const rows = rowsFor(listId);
    if (loading) {
      return (
        <p
          className="mx-5 mt-7 text-[0.9375rem] text-n-ink-muted"
          aria-live="polite"
        >
          Loading…
        </p>
      );
    }
    if (error) {
      return (
        <div className="mx-5 mt-7" role="alert">
          <p className="font-n-display text-[1.375rem] font-semibold text-n-ink">
            Couldn’t load your todos.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="-ml-2 mt-2 min-h-11 cursor-pointer rounded-n-chip px-2 text-[0.9375rem] font-medium text-n-ink-muted n-focus"
          >
            {isFetching ? "Trying again…" : "Try again"}
          </button>
        </div>
      );
    }
    if (rows.length === 0) return renderEmpty(emptyFor);
    return (
      <ul className="pt-2">
        {rows.map((todo) => (
          <TodoRow
            key={todo.id}
            todo={todo}
            subtasks={subtasksOf(todo.id)}
            now={now}
            timeZone={timeZone}
            checked={actions.checked.has(todo.id)}
            collapsing={actions.collapsing.has(todo.id)}
            highlighted={menuId === todo.id}
            onCheck={actions.complete}
            onOpen={(t) => setDetailId(t.id)}
            onMenu={(t) => setMenuId(t.id)}
          />
        ))}
      </ul>
    );
  };

  /** Written empty states: "Nothing today." and "4 waiting in This week →". */
  function renderEmpty(kind: PageKey | null) {
    const next =
      kind === "today"
        ? {
            index: 1,
            kind: "thisWeek" as const,
            name: "This week",
            text: "Nothing today.",
          }
        : kind === "thisWeek"
          ? {
              index: 2,
              kind: "someday" as const,
              name: "Someday",
              text: "A clear week.",
            }
          : null;
    const waiting = next ? rowsFor(byKind[next.kind]?.id).length : 0;
    return (
      <div className="px-5 py-7">
        <p className="m-0 font-n-display text-[1.375rem] font-semibold tracking-[-0.01em] text-n-ink">
          {next?.text ?? "Nothing here yet."}
        </p>
        {next && waiting > 0 && (
          <button
            type="button"
            onClick={() => goTo(next.index)}
            className="mt-2 -ml-0.5 inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-n-chip px-0.5 text-[0.9375rem] text-n-ink-muted n-focus"
          >
            {waiting} waiting in {next.name}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  const collection = collectionId
    ? collections.find((l) => l.id === collectionId)
    : undefined;
  // A collection deleted elsewhere drops back to the index. Only once it's
  // been seen: a just-created list isn't in the cache until the refetch.
  const seenCollection = useRef<string | null>(null);
  useEffect(() => {
    if (collection) seenCollection.current = collection.id;
    else if (collectionId && seenCollection.current === collectionId) {
      seenCollection.current = null;
      setCollectionId(null);
    }
  }, [collection, collectionId]);

  const addList = () => {
    const name = newList.trim();
    if (!name) return;
    setNewList("");
    const last = collections[collections.length - 1];
    createList.mutate(
      { name, position: generateKeyBetween(last?.position ?? null, null) },
      // Open the new list, as tapping it would.
      { onSuccess: (created) => setCollectionId(created.id) },
    );
  };

  const renderPage = (key: PageKey) => {
    if (key === "lists") {
      if (collection) {
        const count = rowsFor(collection.id).length;
        return (
          <>
            <BackButton label="Lists" onClick={() => setCollectionId(null)} />
            <Masthead
              pushed
              title={collection.name}
              subline={plural(count, "todo")}
            />
            {renderRows(collection.id, null)}
          </>
        );
      }
      return (
        <>
          <Masthead
            title="Lists"
            subline={mastheadSubline(
              "lists",
              collections.length,
              now,
              timeZone,
            )}
          />
          <ul className="pt-1.5">
            {collections.map((list) => (
              <li key={list.id}>
                {/* Named by the list, the count as its description ("Groceries,
                    4 todos"), so the name matches what's visible. */}
                <button
                  type="button"
                  aria-describedby={`phone-list-count-${list.id}`}
                  onClick={() => setCollectionId(list.id)}
                  className="mx-5 flex min-h-11 w-[calc(100%-2.5rem)] cursor-pointer items-center gap-3 border-b border-n-hairline py-3.5 text-left text-n-ink n-focus-inset"
                >
                  <span className="min-w-0 flex-1 truncate font-n-display text-[1.375rem] font-semibold tracking-[-0.01em]">
                    {list.name}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-[0.9375rem] text-n-ink-muted tabular-nums"
                  >
                    {rowsFor(list.id).length}
                  </span>
                  <span id={`phone-list-count-${list.id}`} hidden>
                    {plural(rowsFor(list.id).length, "todo")}
                  </span>
                  <ChevronRight
                    size={18}
                    strokeWidth={2.2}
                    aria-hidden="true"
                    className="text-n-ink-muted"
                  />
                </button>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2.5 px-5 py-4 text-n-ink-muted">
            <Plus size={18} aria-hidden="true" className="shrink-0" />
            <span className="sr-only">New list name</span>
            <input
              value={newList}
              onChange={(e) => setNewList(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addList();
                }
              }}
              enterKeyHint="done"
              placeholder="New list"
              className="min-w-0 flex-1 rounded-n-chip bg-transparent p-0 font-n-display text-[1.375rem] font-semibold tracking-[-0.01em] text-n-ink n-focus placeholder:text-n-ink-muted"
            />
          </label>
        </>
      );
    }
    const listId = byKind[key]?.id;
    return (
      <>
        <Masthead
          title={PAGES.find((p) => p.key === key)?.label}
          subline={mastheadSubline(key, rowsFor(listId).length, now, timeZone)}
        />
        {key === "today" && overnight.text && (
          <OvernightNote
            text={overnight.text}
            onDismiss={overnight.dismiss}
            className="mx-5 mt-3"
          />
        )}
        {renderRows(listId, key)}
      </>
    );
  };

  return (
    <div className="fixed inset-x-0 top-[var(--n-offline-inset,0px)] bottom-0 z-10 bg-n-canvas font-n-text text-n-ink antialiased">
      <div className="mx-auto flex h-full max-w-[42rem] flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pr-4 pl-5">
          <nav
            ref={navRef}
            aria-label="Lists"
            onKeyDown={onNavKey}
            className="relative flex min-w-0 flex-1 items-center gap-[1.125rem] overflow-x-auto [scrollbar-width:none]"
          >
            {PAGES.map((p, i) => {
              const active = i === pageIndex;
              return (
                <button
                  key={p.key}
                  type="button"
                  data-page-button
                  aria-current={active ? "page" : undefined}
                  aria-controls={`phone-page-${p.key}`}
                  onClick={() => {
                    if (p.key === "lists" && active) setCollectionId(null);
                    goTo(i);
                  }}
                  className={`n-hit h-11 shrink-0 cursor-pointer rounded-n-chip px-0 text-[0.9375rem] font-semibold tracking-[-0.01em] whitespace-nowrap n-focus transition-colors duration-(--n-duration-fast) ${
                    active ? "text-n-ink" : "text-n-ink-muted"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            <span
              ref={indicatorRef}
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 h-0.5 bg-n-brand"
            />
          </nav>
          <AccountSheet
            open={account}
            onOpen={() => setAccount(true)}
            onClose={() => setAccount(false)}
            doneCount={doneCount}
            onDone={() => {
              setAccount(false);
              setScreen("done");
            }}
            onSettings={() => {
              setAccount(false);
              setScreen("settings");
            }}
            onFeedback={
              canSendFeedback
                ? () => {
                    setAccount(false);
                    setFeedback(true);
                  }
                : undefined
            }
          />
        </div>

        <div
          ref={pagerRef}
          onScroll={onPagerScroll}
          data-phone-ready={loading ? undefined : ""}
          // Nothing to swipe to while loading, and a scroller with nothing
          // focusable in it is a dead end for the keyboard.
          className={`flex min-h-0 flex-1 snap-x snap-mandatory overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
            loading ? "overflow-x-hidden" : "overflow-x-auto"
          }`}
        >
          {PAGES.map((p, i) => (
            <section
              key={p.key}
              id={`phone-page-${p.key}`}
              aria-label={p.label}
              inert={i !== pageIndex}
              className="h-full w-full shrink-0 snap-start snap-always overflow-y-auto overscroll-y-contain pb-40 [scrollbar-width:none]"
            >
              {renderPage(p.key)}
            </section>
          ))}
        </div>
      </div>

      {currentListId && !detailTodo && (
        <Composer
          currentListId={currentListId}
          targets={targets}
          timeZone={timeZone}
          onView={goToList}
          textareaRef={composerRef}
        />
      )}

      <ContextMenu
        todo={menuTodo}
        where={menuTodo ? listName(menuTodo.listId) : ""}
        moveTargets={targets.filter((t) => t.id !== menuTodo?.listId)}
        onClose={() => setMenuId(null)}
        onMove={actions.move}
        onTogglePin={actions.togglePin}
        onDelete={actions.destroy}
      />

      <DetailSheet
        todo={detailTodo}
        subtasks={detailTodo ? subtasksOf(detailTodo.id) : EMPTY}
        listTargets={targets}
        listName={listName}
        timeZone={timeZone}
        actions={actions}
        onClose={() => setDetailId(null)}
      />

      <DoneScreen
        open={screen === "done"}
        onClose={() => setScreen(null)}
        todos={todos}
        listName={listName}
        timeZone={timeZone}
        onRestore={actions.restore}
      />
      <SettingsScreen
        open={screen === "settings"}
        onClose={() => setScreen(null)}
      />
      {canSendFeedback && (
        <FeedbackDialog
          open={feedback}
          onClose={() => setFeedback(false)}
          variant="sheet"
        />
      )}
    </div>
  );
}

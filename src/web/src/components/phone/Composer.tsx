import { splitTodoText } from "@nylon-impossible/shared";
import { ArrowUp, Calendar, Plus, X } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type Ref,
  type SyntheticEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useSmartCreate } from "@/hooks/useTodos";
import { messageFromError, toast } from "@/lib/toast";
import {
  draftDueDay,
  dueChipText,
  type PlannedTodo,
  planSubmit,
  plural,
} from "./model";
import { useKeyboardInset } from "./useKeyboardInset";
import { showActionToast } from "./useTodoActions";

export interface ComposerTarget {
  id: string;
  label: string;
}

/** Keeps focus (and the keyboard) in the field when a chip is tapped. */
const keepFocus = (e: SyntheticEvent) => e.preventDefault();

/** Variable the phone toaster reads to sit just above the composer. */
export const TOAST_OFFSET_VAR = "--n-phone-toast-offset";

/**
 * The composer. One behaviour everywhere: Return adds and keeps focus, a
 * pasted list adds a todo per line, typed dates become a "Due Fri ×" chip,
 * and the list chips pick where it goes.
 *
 * `floating` (phone) is the glass pill attached to the keyboard. `inline`
 * (wide) is the quiet "+ Add" row at the top of a column: it only shows the
 * due chip, since the column already says which list it adds to. `popover`
 * (wide quick add) leads with the target's name and count, and always shows
 * the list chips.
 */
export function Composer({
  currentListId,
  targets,
  timeZone,
  onView,
  textareaRef,
  variant = "floating",
  countFor,
  isVisible,
}: {
  /** The list on screen — the default target. */
  currentListId: string;
  /** Today, This week, Someday, then the user's lists. */
  targets: ComposerTarget[];
  timeZone: string;
  /** "View" on the "Added to …" toast when adding somewhere off-screen. */
  onView: (listId: string) => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
  variant?: "floating" | "inline" | "popover";
  /** `popover`: the count beside the target's name ("Today 4"). */
  countFor?: (listId: string) => number;
  /**
   * Whether a list is on screen, so adding to it needs no "Added to …"
   * toast. Defaults to just `currentListId`.
   */
  isVisible?: (listId: string) => boolean;
}) {
  const inline = variant === "inline";
  const popover = variant === "popover";
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [pickedTarget, setPickedTarget] = useState<string | null>(null);
  const [keepDateWords, setKeepDateWords] = useState(false);
  const smartCreate = useSmartCreate();
  const keyboard = useKeyboardInset();
  const rootRef = useRef<HTMLFormElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement | null>(null);

  // Paging to another list re-aims the composer at it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on page change only
  useEffect(() => setPickedTarget(null), [currentListId]);

  const targetId =
    pickedTarget && targets.some((t) => t.id === pickedTarget)
      ? pickedTarget
      : currentListId;
  const targetLabel = targets.find((t) => t.id === targetId)?.label ?? "Today";

  const now = new Date();
  const dueDay = keepDateWords ? null : draftDueDay(draft, { now, timeZone });
  const hasDraft = draft.trim().length > 0;
  const spillsToNotes = draft
    .split("\n")
    .some((line) => splitTodoText(line).notes !== null);
  const showChips = popover || focused || hasDraft;

  // Publish where the composer's top edge sits so toasts clear it.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el || variant !== "floating") return;
    const publish = () => {
      const fromBottom = window.innerHeight - el.getBoundingClientRect().top;
      document.documentElement.style.setProperty(
        TOAST_OFFSET_VAR,
        `${Math.max(0, Math.round(fromBottom + 10))}px`,
      );
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(TOAST_OFFSET_VAR);
    };
  });

  const setRefs = (node: HTMLTextAreaElement | null) => {
    fieldRef.current = node;
    if (typeof textareaRef === "function") textareaRef(node);
    else if (textareaRef) textareaRef.current = node;
  };

  const submit = async () => {
    const planned = planSubmit(draft, { keepDateWords, now, timeZone });
    if (planned.length === 0) return;
    const listId = targetId;
    // Clear straight away so the next one can be typed while this saves.
    setDraft("");
    setKeepDateWords(false);
    fieldRef.current?.focus();

    // Smart-create prepends, so send a pasted list bottom-up to keep its
    // order on screen.
    // A failed line doesn't stop the rest; only the lines that didn't save
    // go back in the box, so sending again can't duplicate the ones that did.
    const failed = new Set<PlannedTodo>();
    let firstError: unknown = null;
    for (const todo of [...planned].reverse()) {
      try {
        await smartCreate.mutateAsync({
          text: todo.text,
          listId,
          parseDate: false,
          dueDate: todo.dueDay,
        });
      } catch (err) {
        failed.add(todo);
        firstError ??= err;
      }
    }
    if (failed.size > 0) {
      const unsaved = planned.filter((todo) => failed.has(todo));
      setDraft((current) => current || unsaved.map((t) => t.line).join("\n"));
      const reason = messageFromError(firstError, "Couldn't add todo");
      const saved = planned.length - failed.size;
      toast.error(
        saved > 0 ? `${plural(saved, "todo")} added. ${reason}` : reason,
      );
      return;
    }
    if (!(isVisible ? isVisible(listId) : listId === currentListId)) {
      const name = targets.find((t) => t.id === listId)?.label ?? "list";
      const label =
        planned.length > 1
          ? `${plural(planned.length, "todo")} added to ${name}`
          : `Added to ${name}`;
      showActionToast(label, "View", () => onView(listId));
    }
  };

  const onBlur = (e: FocusEvent<HTMLFormElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setFocused(false);
    }
  };

  const bottom =
    keyboard > 0
      ? `${keyboard + 8}px`
      : "calc(1rem + env(safe-area-inset-bottom, 0px))";

  // Inline has no list chips, so only the due chip can show.
  const chips = showChips && (!inline || (dueDay && hasDraft)) && (
    <div
      className={`flex min-w-0 animate-n-fade-in gap-1.5 ${
        inline
          ? "flex-wrap pt-1 pb-2.5 pl-8"
          : popover
            ? "flex-wrap px-5 pt-1 pb-1"
            : "overflow-x-auto px-2.5 pt-2.5 pb-1.5 [scrollbar-width:none]"
      }`}
    >
      {/* The parsed date leads, so it's never scrolled out of view. */}
      {dueDay && hasDraft && (
        <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-n-chip bg-n-fill pr-1 pl-2.5 text-sm font-medium whitespace-nowrap text-n-ink">
          <Calendar size={13} aria-hidden="true" />
          Due {dueChipText(dueDay, now, timeZone)}
          <button
            type="button"
            aria-label="Don’t treat as a date"
            onPointerDown={keepFocus}
            onMouseDown={keepFocus}
            onClick={() => setKeepDateWords(true)}
            className="n-hit flex size-7 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-muted n-focus-inset"
          >
            <X size={12} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </span>
      )}
      {!inline && (
        <fieldset aria-label="Add to list" className="contents">
          {targets.map((t) => {
            const selected = t.id === targetId;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={selected}
                onPointerDown={keepFocus}
                onMouseDown={keepFocus}
                onClick={() => setPickedTarget(t.id)}
                className={`n-hit flex h-8 shrink-0 cursor-pointer items-center rounded-n-chip border px-3 text-sm font-medium whitespace-nowrap transition-colors ${popover ? "n-focus-soft" : "n-focus-inset"} duration-(--n-duration-fast) ${
                  selected
                    ? "border-n-brand bg-n-brand text-n-brand-ink"
                    : "border-n-hairline bg-transparent text-n-ink-muted"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </fieldset>
      )}
    </div>
  );

  const spill = spillsToNotes && (
    <p
      className={`text-[0.8125rem] text-n-ink-muted ${inline ? "pb-2 pl-8" : popover ? "px-5 pb-2" : "px-[1.125rem] pt-2"}`}
    >
      The rest will be saved to notes.
    </p>
  );

  const onFieldKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void submit();
    }
    // The quick-add popover closes itself on Escape.
    if (e.key === "Escape" && !popover) e.currentTarget.blur();
  };

  if (popover) {
    return (
      <form
        ref={rootRef}
        aria-label={`Add a todo to ${targetLabel}`}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="m-0 flex items-baseline gap-2.5 px-5 pt-5 pb-2">
          <span className="font-n-display text-[1.625rem] leading-[1.1] font-bold tracking-[-0.025em] text-n-ink">
            {targetLabel}
          </span>
          {countFor && (
            <span className="text-[0.9375rem] text-n-ink-muted tabular-nums">
              {countFor(targetId)}
            </span>
          )}
        </p>
        <div className="flex items-start gap-2.5 px-5">
          <Plus
            size={16}
            strokeWidth={2.2}
            aria-hidden="true"
            className="mt-3 shrink-0 text-n-ink-muted"
          />
          <textarea
            ref={setRefs}
            rows={1}
            value={draft}
            aria-label={`New todo in ${targetLabel}`}
            placeholder={`Add to ${targetLabel}…`}
            onChange={(e) => {
              setDraft(e.target.value);
              if (!e.target.value) setKeepDateWords(false);
            }}
            onKeyDown={onFieldKeyDown}
            className="field-sizing-content block max-h-40 min-h-10 w-full flex-1 resize-none bg-transparent py-2.5 text-[0.9375rem] leading-5 text-n-ink outline-none placeholder:text-n-ink-muted"
          />
          {hasDraft && (
            <button
              type="submit"
              aria-label="Add todo"
              onPointerDown={keepFocus}
              onMouseDown={keepFocus}
              className="mt-1.5 flex size-7 shrink-0 animate-n-fade-in cursor-pointer items-center justify-center rounded-full bg-n-brand text-n-brand-ink n-focus"
            >
              <ArrowUp size={15} strokeWidth={2.6} aria-hidden="true" />
            </button>
          )}
        </div>
        {spill}
        {chips}
        <p className="m-0 mx-5 mt-3 border-t border-n-hairline pt-3 pb-4 text-xs text-n-ink-muted">
          Enter adds and keeps this open · Esc closes
        </p>
      </form>
    );
  }

  if (inline) {
    return (
      <form
        ref={rootRef}
        aria-label={`Add a todo to ${targetLabel}`}
        data-composer
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onFocus={() => setFocused(true)}
        onBlur={onBlur}
        className={`n-focus-within relative -mx-2.5 rounded-n-field focus-within:z-1 px-2.5 transition-colors duration-(--n-duration-fast) ${
          showChips ? "bg-n-surface" : "pointer-fine:hover:bg-n-surface"
        }`}
      >
        <div className="flex items-start gap-3">
          <Plus
            size={16}
            strokeWidth={2.2}
            aria-hidden="true"
            className="mt-3 ml-[3px] shrink-0 text-n-ink-muted"
          />
          <textarea
            ref={setRefs}
            rows={1}
            value={draft}
            aria-label={`New todo in ${targetLabel}`}
            placeholder="Add"
            onChange={(e) => {
              setDraft(e.target.value);
              if (!e.target.value) setKeepDateWords(false);
            }}
            onKeyDown={onFieldKeyDown}
            className="field-sizing-content block max-h-40 min-h-10 w-full flex-1 resize-none rounded-n-chip bg-transparent py-2.5 text-[0.9375rem] leading-5 text-n-ink outline-none placeholder:text-n-ink-muted"
          />
          {hasDraft && (
            <button
              type="submit"
              aria-label="Add todo"
              onPointerDown={keepFocus}
              onMouseDown={keepFocus}
              className="mt-1.5 flex size-7 shrink-0 animate-n-fade-in cursor-pointer items-center justify-center rounded-full bg-n-brand text-n-brand-ink n-focus"
            >
              <ArrowUp size={15} strokeWidth={2.6} aria-hidden="true" />
            </button>
          )}
        </div>
        {spill}
        {chips}
      </form>
    );
  }

  return (
    <form
      ref={rootRef}
      aria-label="Add a todo"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      style={{ bottom }}
      className="pointer-fine:n-focus-within fixed left-1/2 z-30 w-[min(calc(100%-1.5rem),40.5rem)] -translate-x-1/2 rounded-[1.625rem] border border-[color-mix(in_srgb,var(--n-color-ink)_8%,transparent)] bg-[color-mix(in_srgb,var(--n-color-canvas)_82%,transparent)] shadow-[0_10px_30px_color-mix(in_srgb,black_10%,transparent)] backdrop-blur-[24px] backdrop-saturate-[1.6] transition-[bottom] duration-(--n-duration-fast) ease-n-out"
    >
      {chips}
      {spill}
      <div className="flex items-end">
        <textarea
          ref={setRefs}
          rows={1}
          value={draft}
          aria-label="New todo"
          placeholder={`Add to ${targetLabel}…`}
          enterKeyHint="send"
          onChange={(e) => {
            setDraft(e.target.value);
            if (!e.target.value) setKeepDateWords(false);
          }}
          onKeyDown={onFieldKeyDown}
          className="field-sizing-content block max-h-[5.5rem] min-h-[3.125rem] w-full flex-1 resize-none bg-transparent px-[1.125rem] py-3.5 text-[1.0625rem] leading-[1.375rem] text-n-ink outline-none placeholder:text-n-ink-muted"
        />
        {hasDraft && (
          <button
            type="submit"
            aria-label="Add todo"
            onPointerDown={keepFocus}
            onMouseDown={keepFocus}
            className="mr-[7px] mb-[7px] flex size-9 shrink-0 animate-n-fade-in cursor-pointer items-center justify-center rounded-full bg-n-brand text-n-brand-ink n-focus"
          >
            <ArrowUp size={18} strokeWidth={2.6} aria-hidden="true" />
          </button>
        )}
      </div>
    </form>
  );
}

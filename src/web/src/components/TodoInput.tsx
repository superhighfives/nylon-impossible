import { splitTodoText } from "@nylon-impossible/shared";
import { Plus } from "lucide-react";
import { type Ref, useRef, useState } from "react";
import { useLists } from "@/hooks/useLists";
import { useSmartCreate } from "@/hooks/useTodos";
import { messageFromError, toast } from "@/lib/toast";
import { Button, Loader, SegmentedControl } from "./ui";

export function TodoInput({
  textareaRef,
}: {
  /** Lets the board's global `n` shortcut focus the composer. */
  textareaRef?: Ref<HTMLTextAreaElement>;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const localTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { data: lists } = useLists();
  // null until the user picks a list explicitly — falls back to Today below,
  // computed from `lists` directly so the picker never flips from an
  // uncontrolled value to a controlled one after mount.
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const todayListId = lists?.find((list) => list.systemKind === "today")?.id;
  const listId = selectedListId ?? todayListId;
  const selectedList = lists?.find((list) => list.id === listId);

  // System lists get a segment each; custom lists sit behind the overflow
  // segment. Completed isn't somewhere you add to.
  const systemItems = (lists ?? [])
    .filter((list) => list.systemKind && list.systemKind !== "completed")
    .map((list) => ({ value: list.id, label: list.name }));
  const customItems = (lists ?? [])
    .filter((list) => !list.systemKind)
    .sort((a, b) => a.position.localeCompare(b.position))
    .map((list) => ({ value: list.id, label: list.name }));

  const smartCreate = useSmartCreate();
  const trimmed = text.trim();
  const overflowsToNotes = splitTodoText(text).notes !== null;
  // The list picker unfolds below the field while it's in use, and stays put
  // while its overflow menu (portalled outside the form) is open.
  const expanded = focused || trimmed.length > 0 || menuOpen;

  const setTextareaRef = (node: HTMLTextAreaElement | null) => {
    localTextareaRef.current = node;
    if (typeof textareaRef === "function") textareaRef(node);
    else if (textareaRef) textareaRef.current = node;
  };

  const submit = () => {
    if (!trimmed) return;
    const submitted = text;
    // Clear straight away so the next todo can be typed while this one
    // saves — the row is already on the board optimistically.
    setText("");
    smartCreate.mutate(
      { text: trimmed, listId },
      {
        onSuccess: (result) => {
          if (result.todos.length > 1) {
            toast.success(`Added ${result.todos.length} items`);
          }
        },
        onError: (err) => {
          // Hand the text back unless something new has been typed since.
          setText((current) => current || submitted);
          toast.error(messageFromError(err, "Couldn't add todo"));
        },
      },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  function renderTrailing() {
    if (trimmed) {
      return (
        <Button
          type="submit"
          variant="primary"
          size="xs"
          shape="square"
          // `relative` scopes the tap-target pseudo-element to this button.
          className="relative rounded-full transition-[background-color,color,transform] active:scale-[0.96] before:absolute before:content-[''] before:-top-[6px] before:-bottom-[6px] before:-left-[6px] before:-right-[6px]"
          aria-label="Add todo"
        >
          <Plus size={14} />
        </Button>
      );
    }
    if (smartCreate.isPending) {
      return (
        <div className="flex size-7 items-center justify-center">
          <Loader size="sm" className="text-gray-muted" />
        </div>
      );
    }
    return null;
  }

  return (
    <div className="todo-input-wrapper relative h-10">
      <form
        onSubmit={handleSubmit}
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setFocused(false);
          }
        }}
        aria-busy={smartCreate.isPending}
        className="todo-input-container absolute inset-x-0 top-0 rounded-[20px] bg-gray-surface p-1 shadow-lg ring-1 ring-gray-subtle transition-shadow focus-within:ring-2 focus-within:ring-accent-strong"
      >
        <div className="flex items-end gap-1">
          <textarea
            ref={setTextareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              selectedList ? `Add to ${selectedList.name}…` : "Add a todo…"
            }
            aria-label="New todo"
            rows={1}
            className="field-sizing-content block max-h-40 min-h-8 w-full resize-none bg-transparent px-3 py-1.5 text-sm leading-5 text-gray outline-none placeholder:text-gray-muted [@supports(-webkit-touch-callout:none)]:!text-base"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") e.currentTarget.blur();
            }}
          />
          <div className="flex h-8 shrink-0 items-center pr-0.5">
            {renderTrailing()}
          </div>
        </div>
        {overflowsToNotes && (
          <p className="px-3 pb-1 text-xs text-gray-muted">
            The rest will be saved to notes.
          </p>
        )}
        {systemItems.length > 0 && (
          <div
            inert={!expanded}
            className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out-strong ${
              expanded
                ? "grid-rows-[1fr] opacity-100"
                : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="px-0.5 pt-1 pb-0.5">
                <SegmentedControl
                  aria-label="List to add to"
                  items={systemItems}
                  overflowItems={customItems}
                  value={listId}
                  onValueChange={(value) => {
                    setSelectedListId(value);
                    // Keep typing where you left off after picking a list.
                    localTextareaRef.current?.focus();
                  }}
                  onOverflowOpenChange={setMenuOpen}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

import { Plus } from "lucide-react";
import { type Ref, useState } from "react";
import { useLists } from "@/hooks/useLists";
import { useSmartCreate } from "@/hooks/useTodos";
import { messageFromError, toast } from "@/lib/toast";
import { Button, Loader, Select, Textarea } from "./ui";

export function TodoInput({
  textareaRef,
}: {
  /** Lets the board's global `n` shortcut focus the composer. */
  textareaRef?: Ref<HTMLTextAreaElement>;
}) {
  const [text, setText] = useState("");
  const { data: lists } = useLists();
  // null until the user picks a list explicitly — falls back to Today below,
  // computed from `lists` directly so Select never flips from an
  // uncontrolled (undefined) value to a controlled one after mount.
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const todayListId = lists?.find((list) => list.systemKind === "today")?.id;
  const listId = selectedListId ?? todayListId;

  const smartCreate = useSmartCreate();
  const trimmed = text.trim();

  const submit = () => {
    if (!trimmed || smartCreate.isPending) return;
    smartCreate.mutate(
      { text: trimmed, listId },
      {
        onSuccess: (result) => {
          setText("");
          if (result.todos.length > 1) {
            toast.success(`Added ${result.todos.length} items`);
          }
        },
        onError: (err) => {
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
    if (smartCreate.isPending) {
      return (
        <div className="flex shrink-0 items-center pr-1.5">
          <Loader size="sm" className="text-gray-muted" />
        </div>
      );
    }
    if (!trimmed) return null;

    return (
      <div className="flex shrink-0 items-center pr-1">
        <Button
          type="submit"
          variant="primary"
          size="xs"
          shape="square"
          // `relative` scopes the tap-target pseudo-element to this button.
          className="relative transition-[background-color,color,transform] active:scale-[0.96] before:absolute before:content-[''] before:-top-[6px] before:-bottom-[6px] before:-left-[6px] before:-right-[6px]"
          aria-label="Add todo"
        >
          <Plus size={14} />
        </Button>
      </div>
    );
  }

  return (
    <div className="todo-input-wrapper">
      <form onSubmit={handleSubmit}>
        <div className="todo-input-container flex items-center gap-1 rounded-full bg-gray-surface shadow-lg ring-1 ring-gray-subtle transition-shadow focus-within:ring-2 focus-within:ring-accent-strong">
          {lists && lists.length > 0 && (
            <div className="w-20 shrink-0 pl-1">
              <Select
                size="xs"
                value={listId ?? undefined}
                onValueChange={(value) => setSelectedListId(value as string)}
                disabled={smartCreate.isPending}
                aria-label="List to add to"
                items={lists.map((list) => ({
                  value: list.id,
                  label: list.name,
                }))}
              />
            </div>
          )}
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a todo…"
            aria-label="New todo"
            disabled={smartCreate.isPending}
            rows={1}
            minHeightClassName="min-h-0"
            className="w-full resize-none overflow-hidden rounded-full border-0 py-1.5 pl-3 shadow-none ring-0 focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          {renderTrailing()}
        </div>
      </form>
    </div>
  );
}

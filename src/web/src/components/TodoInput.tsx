import { Plus } from "lucide-react";
import { type Ref, useState } from "react";
import { useSmartCreate } from "@/hooks/useTodos";
import { messageFromError, toast } from "@/lib/toast";
import { Button, Loader, Textarea } from "./ui";

export function TodoInput({
  textareaRef,
}: {
  /** Lets the board's global `n` shortcut focus the composer. */
  textareaRef?: Ref<HTMLTextAreaElement>;
}) {
  const [text, setText] = useState("");

  const smartCreate = useSmartCreate();
  const trimmed = text.trim();

  const submit = () => {
    if (!trimmed || smartCreate.isPending) return;
    smartCreate.mutate(
      { text: trimmed },
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
        <div className="todo-input-container flex items-center gap-1 rounded-full bg-gray-surface shadow-lg ring-1 ring-gray-subtle">
          <Textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add to Today…"
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

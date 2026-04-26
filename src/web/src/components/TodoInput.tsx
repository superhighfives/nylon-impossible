import { Plus } from "lucide-react";
import { useState } from "react";
import { useSmartCreate } from "@/hooks/useTodos";
import { Button, Loader, Textarea } from "./ui";

export function TodoInput() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const smartCreate = useSmartCreate();
  const trimmed = text.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || smartCreate.isPending) return;

    setError(null);
    setFeedback(null);

    smartCreate.mutate(trimmed, {
      onSuccess: (result) => {
        setText("");
        if (result.todos.length > 1) {
          setFeedback(`Added ${result.todos.length} items`);
          setTimeout(() => setFeedback(null), 3000);
        }
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : "Failed to create todo");
      },
    });
  };

  function renderTrailing() {
    if (smartCreate.isPending) {
      return (
        <div className="absolute right-3 bottom-3">
          <Loader size="sm" className="text-gray-muted" />
        </div>
      );
    }
    if (trimmed) {
      return (
        <Button
          type="submit"
          variant="primary"
          size="xs"
          shape="square"
          className="absolute right-2 bottom-2 transition-[background-color,color,transform] active:scale-[0.96] before:absolute before:inset-[-6px] before:content-['']"
          aria-label="Add todo"
        >
          <Plus size={14} />
        </Button>
      );
    }
    return null;
  }

  return (
    <div className="space-y-2 todo-input-wrapper">
      {error && <p className="text-sm text-red-muted">{error}</p>}
      {feedback && (
        <p className="text-sm text-gray-muted tabular-nums">{feedback}</p>
      )}

      <form onSubmit={handleSubmit}>
        <div className="todo-input-container relative bg-gray-surface shadow-base rounded-2xl">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs to be done?"
            aria-label="New todo"
            disabled={smartCreate.isPending}
            rows={1}
            className={`w-full resize-none min-h-0 transition-[padding] ${trimmed ? "pb-12" : ""}`}
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

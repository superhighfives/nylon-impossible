import { InputArea } from "@cloudflare/kumo";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useSmartCreate } from "@/hooks/useTodos";

export function TodoInput() {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const smartCreate = useSmartCreate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || smartCreate.isPending) return;

    setError(null);
    setFeedback(null);

    smartCreate.mutate(text.trim(), {
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

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-error">{error}</p>}
      {feedback && <p className="text-sm text-muted">{feedback}</p>}

      <form onSubmit={handleSubmit}>
        <div className="relative">
          <InputArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs to be done?"
            aria-label="New todo"
            disabled={smartCreate.isPending}
            rows={1}
            className="w-full resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          {smartCreate.isPending && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 animate-spin text-muted" />
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

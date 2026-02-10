import { Button, Input, InputArea } from "@cloudflare/kumo";
import { Loader, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  useCreateTodo,
  useCreateTodosBatch,
  useExtractTodos,
} from "@/hooks/useTodos";
import type { ExtractedTodo } from "@/lib/ai-types";
import { TodoPreview } from "./TodoPreview";

type InputMode = "quick" | "extracting" | "preview";

/**
 * Smart todo input that supports both quick add and AI extraction
 *
 * - Short text (< 50 chars, no sentences): Quick add mode
 * - Longer text or multi-line: Shows AI extraction option
 */
export function TodoInput() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<InputMode>("quick");
  const [extractedTodos, setExtractedTodos] = useState<ExtractedTodo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createTodo = useCreateTodo();
  const extractTodos = useExtractTodos();
  const createTodosBatch = useCreateTodosBatch();

  // Determine if text looks like it needs AI extraction
  const isLongForm =
    text.length > 50 || text.includes("\n") || /[.!?]/.test(text);

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    createTodo.mutate(
      { title: text.trim() },
      {
        onSuccess: () => {
          setText("");
          setError(null);
        },
      },
    );
  };

  const handleExtract = async () => {
    if (!text.trim()) return;

    setMode("extracting");
    setError(null);

    extractTodos.mutate(text, {
      onSuccess: (result) => {
        setExtractedTodos(result.todos);
        setMode("preview");
      },
      onError: (err) => {
        setError(
          err instanceof Error ? err.message : "Failed to extract todos",
        );
        setMode("quick");
      },
    });
  };

  const handleConfirmExtracted = () => {
    const selectedTodos = extractedTodos.filter((t) => t.selected);
    if (selectedTodos.length === 0) return;

    createTodosBatch.mutate(selectedTodos, {
      onSuccess: () => {
        setText("");
        setExtractedTodos([]);
        setMode("quick");
        setError(null);
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : "Failed to create todos");
      },
    });
  };

  const handleCancelPreview = () => {
    setExtractedTodos([]);
    setMode("quick");
  };

  // Preview mode - show extracted todos
  if (mode === "preview") {
    return (
      <TodoPreview
        todos={extractedTodos}
        onTodosChange={setExtractedTodos}
        onConfirm={handleConfirmExtracted}
        onCancel={handleCancelPreview}
        isCreating={createTodosBatch.isPending}
      />
    );
  }

  // Extracting mode - show loading state
  if (mode === "extracting") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-color bg-surface p-6">
        <Loader className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted">Extracting todos from text...</p>
      </div>
    );
  }

  // Quick mode - normal input or textarea based on content
  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-error-surface p-3 text-sm text-error">
          {error}
        </div>
      )}

      <form onSubmit={handleQuickAdd} className="space-y-3">
        {isLongForm ? (
          // Multi-line input for longer text
          <InputArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste meeting notes, brain dump, or list of tasks..."
            disabled={createTodo.isPending}
            className="min-h-[120px] w-full"
          />
        ) : (
          // Single-line input for quick adds
          <Input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs to be done?"
            disabled={createTodo.isPending}
            className="w-full"
          />
        )}

        <div className="flex gap-2">
          {isLongForm ? (
            // Long-form actions: Extract with AI or quick add anyway
            <>
              <Button
                type="button"
                variant="primary"
                onClick={handleExtract}
                disabled={!text.trim() || extractTodos.isPending}
                className="flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Extract todos
              </Button>
              <Button
                type="submit"
                variant="secondary"
                disabled={createTodo.isPending || !text.trim()}
              >
                Add as single todo
              </Button>
            </>
          ) : (
            // Quick add action
            <Button
              type="submit"
              variant="primary"
              disabled={createTodo.isPending || !text.trim()}
              className="w-full"
            >
              Add
            </Button>
          )}
        </div>
      </form>

      {/* Hint for long-form input */}
      {!isLongForm && text.length > 0 && (
        <p className="text-xs text-muted">
          Tip: Paste longer text or meeting notes to extract multiple todos with
          AI
        </p>
      )}
    </div>
  );
}

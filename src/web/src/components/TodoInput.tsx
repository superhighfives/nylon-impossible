import { Button, Input, InputArea } from "@cloudflare/kumo";
import { Loader, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import {
  useCreateTodo,
  useCreateTodosBatch,
  useExtractTodos,
} from "@/hooks/useTodos";
import type { ExtractedTodo } from "@/lib/ai-types";
import { TodoPreview } from "./TodoPreview";

type InputMode = "input" | "extracting" | "preview";

/**
 * Smart todo input that supports both quick add and AI extraction
 *
 * Always shows both options:
 * - "Extract todos" to use AI to parse natural language
 * - "Add as single todo" for quick direct adds
 */
export function TodoInput() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<InputMode>("input");
  const [extractedTodos, setExtractedTodos] = useState<ExtractedTodo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createTodo = useCreateTodo();
  const extractTodos = useExtractTodos();
  const createTodosBatch = useCreateTodosBatch();

  // Use textarea for multi-line content
  const isMultiLine = text.includes("\n");

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
        setMode("input");
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
        setMode("input");
        setError(null);
      },
      onError: (err) => {
        setError(err instanceof Error ? err.message : "Failed to create todos");
      },
    });
  };

  const handleCancelPreview = () => {
    setExtractedTodos([]);
    setMode("input");
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
      <div className="flex flex-col items-center gap-3 rounded-xl border border-kumo-line bg-kumo-elevated p-6">
        <Loader className="h-6 w-6 animate-spin text-kumo-brand" />
        <p className="text-sm text-kumo-subtle">Extracting todos from text...</p>
      </div>
    );
  }

  // Input mode - always show both options
  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-kumo-danger-tint p-3 text-sm text-kumo-danger">
          {error}
        </div>
      )}

      <form onSubmit={handleQuickAdd} className="space-y-3">
        {isMultiLine ? (
          <InputArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs to be done?"
            aria-label="New todo"
            disabled={createTodo.isPending}
            className="min-h-[120px] w-full"
          />
        ) : (
          <Input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs to be done?"
            aria-label="New todo"
            disabled={createTodo.isPending}
            className="w-full"
          />
        )}

        <div className="flex gap-2">
          <Button
            type="submit"
            variant="primary"
            disabled={createTodo.isPending || !text.trim()}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add todo
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleExtract}
            disabled={!text.trim() || extractTodos.isPending}
            className="flex items-center gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Extract todos
          </Button>
        </div>
      </form>
    </div>
  );
}

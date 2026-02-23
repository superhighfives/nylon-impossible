import { Button, InputArea } from "@cloudflare/kumo";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
  useCreateTodo,
  useCreateTodosBatch,
  useExtractTodos,
} from "@/hooks/useTodos";
import type { ExtractedTodo } from "@/lib/ai-types";
import { TodoPreview } from "./TodoPreview";

type InputMode = "input" | "extracting" | "preview";

export function TodoInput() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<InputMode>("input");
  const [extractedTodos, setExtractedTodos] = useState<ExtractedTodo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createTodo = useCreateTodo();
  const extractTodos = useExtractTodos();
  const createTodosBatch = useCreateTodosBatch();

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

  if (mode === "extracting") {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted" />
        <span className="ml-2 text-sm text-muted">Extracting...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-error">{error}</p>
      )}

      <form onSubmit={handleQuickAdd}>
        <InputArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What needs to be done?"
          aria-label="New todo"
          disabled={createTodo.isPending}
          rows={text.includes("\n") ? 4 : 1}
          className="w-full resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !text.includes("\n")) {
              e.preventDefault();
              handleQuickAdd(e);
            }
          }}
        />

        <div className="flex gap-2 pt-2">
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={createTodo.isPending || !text.trim()}
          >
            Add
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onClick={handleExtract}
            disabled={!text.trim() || extractTodos.isPending}
          >
            Extract with AI
          </Button>
        </div>
      </form>
    </div>
  );
}

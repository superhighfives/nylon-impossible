import { Bot, User } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useDismissTodoQuestion, useReplyToTodo } from "@/hooks/useTodos";
import type { TodoWithUrls } from "@/types/database";
import { Button, Input } from "./ui";

interface ConversationSectionProps {
  todo: TodoWithUrls;
}

export function ConversationSection({ todo }: ConversationSectionProps) {
  const [draft, setDraft] = useState("");
  const reply = useReplyToTodo();
  const dismiss = useDismissTodoQuestion();

  if (todo.messages.length === 0) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    reply.mutate({ todoId: todo.id, content });
    setDraft("");
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-muted">Conversation</p>
      <div className="flex flex-col gap-2 rounded-lg bg-gray-surface p-3">
        {todo.messages.map((m) => {
          const isAssistant = m.role === "assistant";
          return (
            <div key={m.id} className="flex items-start gap-2 text-sm">
              {isAssistant ? (
                <Bot
                  size={14}
                  aria-hidden
                  className="mt-0.5 shrink-0 text-yellow"
                />
              ) : (
                <User
                  size={14}
                  aria-hidden
                  className="mt-0.5 shrink-0 text-gray-muted"
                />
              )}
              <span className="sr-only">
                {isAssistant ? "Assistant: " : "You: "}
              </span>
              <p className={isAssistant ? "text-gray" : "text-gray-muted"}>
                {m.content}
              </p>
            </div>
          );
        })}

        {todo.needsInput && (
          <form
            onSubmit={handleSubmit}
            className="mt-1 flex items-center gap-2"
          >
            <Input
              inputSize="sm"
              placeholder="Reply..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={reply.isPending}
              aria-label="Reply to the assistant's question"
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={reply.isPending}
              disabled={!draft.trim()}
            >
              Send
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => dismiss.mutate({ todoId: todo.id })}
              disabled={dismiss.isPending}
            >
              Dismiss
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

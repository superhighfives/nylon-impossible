import { AlertCircle, Bot, Send, User } from "lucide-react";
import { type FormEvent, useState } from "react";
import {
  type AgentMessage,
  useSendTodoAgentMessage,
  useTodoAgentMessages,
} from "@/hooks/useTodoAgent";
import { useConfirmTodoAgentDelete } from "@/hooks/useTodos";
import type { TodoWithUrls } from "@/types/database";
import { Button, ConfirmDialog, Input, Loader } from "./ui";

interface TodoAgentChatProps {
  todo: TodoWithUrls;
}

function messageText(message: AgentMessage): string {
  return message.parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

/** Whether `message` carries the propose_delete tool's data part from this turn. */
function proposesDelete(message: AgentMessage): boolean {
  return message.parts.some(
    (part) => part.type === "data-pendingDelete" && part.data === true,
  );
}

// Talk to a single todo's agent — a distinct surface from ConversationSection
// (the AI's own creation-time clarifying question). Opened explicitly by the
// user, scoped to this one todo, backed by src/todo-agent via src/api's
// proxy routes rather than the todoMessages table.
export function TodoAgentChat({ todo }: TodoAgentChatProps) {
  const [draft, setDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { data: conversation, isLoading } = useTodoAgentMessages(todo.id, true);
  const send = useSendTodoAgentMessage(todo.id);
  const confirmDelete = useConfirmTodoAgentDelete();

  const messages = (conversation?.messages ?? []).filter(
    (m) => m.role === "user" || m.role === "assistant",
  );
  const lastMessage = messages.at(-1);
  const pendingDelete = lastMessage ? proposesDelete(lastMessage) : false;

  // A submission with no assistant reply yet and no settlement is still in
  // flight — cheap enough to just scan on render, the list stays short.
  const pending =
    send.isPending ||
    messages.some((m) => {
      if (m.role !== "user") return false;
      const hasReply = messages.some(
        (r) => r.role === "assistant" && r.submissionId === m.submissionId,
      );
      const settled = (conversation?.settlements ?? []).some(
        (s) => s.submissionId === m.submissionId,
      );
      return !hasReply && !settled;
    });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || pending) return;
    send.mutate(content);
    setDraft("");
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-gray-muted">Chat</p>
      <div className="flex flex-col gap-2 rounded-lg bg-gray-surface p-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-muted">
            <Loader size="sm" />
            Loading…
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-muted">
            Ask this todo's assistant to help you work it — research, update its
            details, add subtasks, or mark it done.
          </p>
        ) : (
          messages.map((m) => {
            const isAssistant = m.role === "assistant";
            const settlement = (conversation?.settlements ?? []).find(
              (s) => s.submissionId === m.submissionId,
            );
            const text = messageText(m);
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
                {text ? (
                  <p className={isAssistant ? "text-gray" : "text-gray-muted"}>
                    {text}
                  </p>
                ) : settlement?.error ? (
                  <p className="flex items-start gap-1.5 text-red-muted">
                    <AlertCircle
                      size={14}
                      aria-hidden
                      className="mt-0.5 shrink-0"
                    />
                    Something went wrong answering that.
                  </p>
                ) : null}
              </div>
            );
          })
        )}

        {pending && (
          <div className="flex items-center gap-2 text-sm text-gray-muted">
            <Loader size="sm" />
            Thinking…
          </div>
        )}

        {pendingDelete && (
          <div className="flex items-center justify-between gap-2 rounded-md bg-red-base p-2 text-sm text-red-muted">
            <span>Delete this todo?</span>
            <Button
              variant="destructive"
              size="xs"
              type="button"
              onClick={() => setConfirmingDelete(true)}
            >
              Confirm
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-1 flex items-center gap-2">
          <Input
            inputSize="sm"
            placeholder="Message this todo's assistant…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            aria-label="Message this todo's assistant"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={send.isPending}
            disabled={!draft.trim() || pending}
          >
            {!send.isPending && <Send size={14} />}
            Send
          </Button>
        </form>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete this todo?"
        description={`"${todo.title}" and any subtasks will be deleted. This can't be undone.`}
        onConfirm={() => {
          confirmDelete.mutate(todo.id, {
            onSuccess: () => setConfirmingDelete(false),
          });
        }}
        confirmPending={confirmDelete.isPending}
      />
    </div>
  );
}

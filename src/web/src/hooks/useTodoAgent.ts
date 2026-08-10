import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "@/lib/config";
import { Sentry } from "@/lib/sentry";
import { messageFromError, toast } from "@/lib/toast";

/**
 * Shapes returned by src/todo-agent's `createAgentRouter` (via src/api's
 * proxy) — an AI-SDK-style conversation read. Only the fields this UI
 * actually reads are typed; the wire format carries more (offset,
 * incarnation, etc.) that isn't needed here.
 */
export interface AgentMessagePart {
  type: string;
  text?: string;
  data?: unknown;
}

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  submissionId: string;
  parts: AgentMessagePart[];
}

export interface AgentSettlement {
  submissionId: string;
  outcome: "failed" | "aborted" | string;
  error?: { message: string };
}

export interface AgentConversation {
  messages: AgentMessage[];
  settlements: AgentSettlement[];
}

const EMPTY_CONVERSATION: AgentConversation = { messages: [], settlements: [] };

function agentQueryKey(todoId: string) {
  return ["todo-agent", todoId];
}

/** True once every message so far has either an assistant reply or a settlement (success or failure) — i.e. nothing is still in flight. */
function isSettled(conversation: AgentConversation): boolean {
  const submissionIds = new Set(
    conversation.messages.map((m) => m.submissionId),
  );
  for (const id of submissionIds) {
    const hasReply = conversation.messages.some(
      (m) => m.submissionId === id && m.role === "assistant",
    );
    const hasSettlement = conversation.settlements.some(
      (s) => s.submissionId === id,
    );
    if (!hasReply && !hasSettlement) return false;
  }
  return true;
}

/**
 * Read a todo's agent chat. Polls at a short interval while a turn looks
 * unsettled (the model is still thinking / a tool is running) and stops
 * once everything has a reply or a failure — no need for a live socket for
 * v1's usage pattern (one user, one open tab, occasional turns).
 */
export function useTodoAgentMessages(todoId: string, enabled: boolean) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: agentQueryKey(todoId),
    queryFn: async (): Promise<AgentConversation> => {
      const token = await getToken();
      const response = await fetch(
        `${API_URL}/todos/${todoId}/agent/messages`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );

      // Flue 404s a stream that's never had a first message — that's just
      // an empty chat, not an error.
      if (response.status === 404) return EMPTY_CONVERSATION;
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      return response.json();
    },
    enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && isSettled(data) ? false : 2000;
    },
  });
}

/** Send a message to a todo's agent chat. Fire-and-forget admission — the reply arrives via `useTodoAgentMessages`' poll. */
export function useSendTodoAgentMessage(todoId: string) {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (message: string) => {
      const token = await getToken();
      const response = await fetch(`${API_URL}/todos/${todoId}/agent/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      return response.json();
    },
    onError: (err) => {
      Sentry.captureException(err, {
        tags: { mutation: "sendTodoAgentMessage" },
      });
      toast.error(messageFromError(err, "Couldn't send message"));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: agentQueryKey(todoId) });
    },
  });
}

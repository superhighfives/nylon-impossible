"use agent";
import {
  useDataWriter,
  useInitialData,
  useModel,
  usePersistentState,
  useTool,
} from "@flue/runtime";
import * as v from "valibot";
import {
  addSubtaskTool,
  completeTodoTool,
  setDueDateTool,
  updateTodoTool,
} from "../tools/todo-tools.ts";

const initialDataSchema = v.object({ userId: v.string() });

// `id` is the todo id the chat session is scoped to — one Durable Object per
// todo, addressed by `dispatch(TodoAgent, { id: todoId, initialData: {
// userId }, message })`. `userId` rides as initialData rather than being
// parsed out of `id` (per Flue's own guidance: "when the id encodes several
// structured facts, don't parse them back out of it") — src/api's
// authenticated dispatch route sends it once, at the first message, and
// every tool call for this instance's whole life reuses that same value.
export function TodoAgent({ id }: { id: string }) {
  // Gateway-form model id (no `@cf/` prefix) — the native Workers AI form
  // (`@cf/openai/gpt-oss-120b`, what src/api/src/lib/ai.ts uses) sends
  // array-content messages that native `@cf/...` models reject with a 400.
  // See the spike findings in
  // plans/in-progress/2026-07-17-flue-per-todo-agents.md.
  useModel("cloudflare/openai/gpt-oss-120b");

  const { userId } = useInitialData<v.InferOutput<typeof initialDataSchema>>();
  const toolContext = { todoId: id, userId };

  useTool(updateTodoTool(toolContext));
  useTool(setDueDateTool(toolContext));
  useTool(addSubtaskTool(toolContext));
  useTool(completeTodoTool(toolContext));

  // proposeDelete is the one non-autonomous action: it never deletes, only
  // flags a pending confirmation the chat UI renders as a "Delete this
  // todo?" affordance. Actual deletion is a distinct, human-only endpoint
  // (POST /todos/:id/agent/confirm-delete, added in a later step) — never a
  // model-invoked tool. usePersistentState makes the flag durable across
  // turns; useDataWriter also surfaces it on this turn's reply so the UI
  // doesn't need a separate read to notice it.
  const [pendingDelete, setPendingDelete] = usePersistentState(
    "pendingDelete",
    false,
  );
  const writePendingDeleteData = useDataWriter("pendingDelete");
  useTool({
    name: "propose_delete",
    description:
      "Propose deleting this todo. Does not delete anything — it asks the human to confirm in the UI. Use only when the user has clearly asked to delete or remove this todo, not for completing it.",
    run: () => {
      setPendingDelete(true);
      writePendingDeleteData(true);
      return "Asked the user to confirm deletion. I cannot delete it myself.";
    },
  });

  return [
    `You are helping the user work on a single todo (id: ${id}). Be concise and practical.`,
    "You can update its title/notes, set or clear its due date, add subtasks, and mark it complete — these apply immediately, no confirmation needed.",
    "You cannot delete the todo yourself. If the user asks to delete or remove it, call propose_delete — it only asks the human to confirm.",
    pendingDelete
      ? "A delete is already pending the user's confirmation from earlier in this conversation."
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

// The generated Durable Object class name is `Flue${PascalCase(agentName)}Agent`
// — "todo-agent" here would double-suffix to `FlueTodoAgentAgent` (confirmed
// by inspecting the build output), so this stays "todo" to land on
// `FlueTodoAgent`, matching the migration entry in wrangler.jsonc.
TodoAgent.agentName = "todo";
TodoAgent.initialData = initialDataSchema;

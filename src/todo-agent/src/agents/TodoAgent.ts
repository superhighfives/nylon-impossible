"use agent";
import { useModel } from "@flue/runtime";

// `id` is the todo id the chat session is scoped to — one Durable Object
// per todo, addressed by `dispatch(TodoAgent, { id: todoId, message })`.
export function TodoAgent({ id }: { id: string }) {
  // Gateway-form model id (no `@cf/` prefix) — the native Workers AI form
  // (`@cf/openai/gpt-oss-120b`, what src/api/src/lib/ai.ts uses) sends
  // array-content messages that native `@cf/...` models reject with a 400.
  // See the spike findings in
  // plans/in-progress/2026-07-17-flue-per-todo-agents.md.
  useModel("cloudflare/openai/gpt-oss-120b");

  // Tools (update title/notes/due date, add/complete subtasks, complete,
  // propose-delete) land in a later implementation step — this is scaffolding
  // only, so the agent can talk about the todo but can't act on it yet.
  return `You are helping the user work on a single todo (id: ${id}). Be concise and practical.`;
}

// The generated Durable Object class name is `Flue${PascalCase(agentName)}Agent`
// — "todo-agent" here would double-suffix to `FlueTodoAgentAgent` (confirmed
// by inspecting the build output), so this stays "todo" to land on
// `FlueTodoAgent`, matching the migration entry in wrangler.jsonc.
TodoAgent.agentName = "todo";

import { dispatch, init } from "@flue/runtime";
import { Hono } from "hono";
import { TodoAgent } from "./agents/TodoAgent.ts";

// No public DNS route for this Worker — reachable only via the
// `TODO_AGENT` Service Binding from src/api (see
// plans/in-progress/2026-07-17-flue-per-todo-agents.md), so there's no
// separate auth layer here: src/api already resolved and authorized the
// caller before it reaches this fetch.
const app = new Hono();

app.post("/dispatch/:id", async (c) => {
  const id = c.req.param("id");
  const { message, userId } = await c.req.json();
  // initialData only seeds the instance on the send that creates it — safe
  // to send unconditionally on every message, later ones just ignore it.
  const receipt = await dispatch(TodoAgent, {
    id,
    message,
    initialData: { userId },
  });
  return c.json({ receipt });
});

app.get("/read/:id/:submissionId", async (c) => {
  const id = c.req.param("id");
  const submissionId = c.req.param("submissionId");
  const reply = await init(TodoAgent, { id }).read(submissionId);
  return c.json({ reply });
});

export default app;

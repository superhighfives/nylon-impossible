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
  const { message } = await c.req.json();
  const receipt = await dispatch(TodoAgent, { id, message });
  return c.json({ receipt });
});

app.get("/read/:id/:submissionId", async (c) => {
  const id = c.req.param("id");
  const submissionId = c.req.param("submissionId");
  const reply = await init(TodoAgent, { id }).read(submissionId);
  return c.json({ reply });
});

export default app;

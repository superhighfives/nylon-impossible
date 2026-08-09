import { createAgentRouter } from "@flue/runtime/routing";
import { Hono } from "hono";
import { TodoAgent } from "./agents/TodoAgent.ts";

// No public DNS route for this Worker — reachable only via the
// `TODO_AGENT` Service Binding from src/api (see
// plans/in-progress/2026-07-17-flue-per-todo-agents.md), so there's no
// separate auth layer here: src/api already resolved and authorized the
// caller before it reaches this fetch.
//
// createAgentRouter (not a hand-rolled dispatch/read pair — an earlier
// version of this file had one) gives the full HTTP surface a chat UI
// needs for free: `POST /:id` sends a message (accepts `{ message,
// initialData }`, matching what src/api forwards), `GET|HEAD /:id` is a
// resumable AI-SDK-style conversation stream read (the piece a hand-rolled
// version would have had to build from scratch), `POST /:id/abort` aborts.
const app = new Hono();
app.route("/", createAgentRouter(TodoAgent));

export default app;

import { vi } from "vitest";

// Mock the background-enrichment side effect so handlers (smart-create,
// reresearch, todos) don't actually hit Workers AI in tests. The real
// enrichTodoWithAI runs inside ctx.waitUntil() and would otherwise crash
// because env.AI is not bound in wrangler.test.jsonc — leaving stderr full
// of "Cannot read properties of undefined (reading 'run')" noise even
// though tests still pass.
//
// Tests assert on the immediate handler response shape (todo created,
// aiStatus pending, etc.), not on what enrichment ultimately produces, so
// a no-op is sufficient here. Falls through to the real module when
// RUN_AI_TESTS=true so the gated real-AI integration suite can exercise
// the actual enrichment path.
//
// vi.mock must be at the top level — vitest hoists it before tests run
// and warns/errors if it's nested. The conditional lives inside the
// factory instead.
vi.mock("../src/lib/ai-enrich", async (importActual) => {
  if (process.env.RUN_AI_TESTS === "true") {
    return await importActual<typeof import("../src/lib/ai-enrich")>();
  }
  return {
    enrichTodoWithAI: vi.fn().mockResolvedValue(undefined),
  };
});

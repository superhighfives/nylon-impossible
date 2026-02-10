/**
 * Types for AI-powered todo extraction
 */

/**
 * A todo item extracted from natural language text
 */
export interface ExtractedTodo {
  /** Concise action item */
  title: string;
  /** ISO 8601 date string if a deadline was mentioned, null otherwise */
  dueDate: string | null;
  /** Unique ID for tracking in preview UI */
  tempId: string;
  /** Whether the user wants to include this todo */
  selected: boolean;
}

/**
 * Input for the extraction server function
 */
export interface ExtractTodosInput {
  text: string;
}

/**
 * Response from the extraction server function
 */
export interface ExtractTodosResult {
  todos: ExtractedTodo[];
}

/**
 * Tool definition for Workers AI tool calling
 */
export const extractTodosTool = {
  type: "function" as const,
  function: {
    name: "extract_todos",
    description:
      "Extract actionable todo items from text. Each todo should be a clear, concise action item. Only extract items that represent tasks the user needs to do.",
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          description: "List of extracted todo items",
          items: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description:
                  "Concise action item starting with a verb (e.g., 'Buy groceries', 'Email team about Friday meeting', 'Review PR #123')",
              },
              dueDate: {
                type: "string",
                description:
                  "ISO 8601 date (YYYY-MM-DD) if a deadline is mentioned (e.g., 'by Friday' -> next Friday's date, 'tomorrow' -> tomorrow's date), null if no date mentioned",
                nullable: true,
              },
            },
            required: ["title"],
          },
        },
      },
      required: ["todos"],
    },
  },
};

/**
 * Raw response from the AI tool call
 */
export interface AIToolCallResponse {
  todos: Array<{
    title: string;
    dueDate?: string | null;
  }>;
}

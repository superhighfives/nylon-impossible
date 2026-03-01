/**
 * AI-powered todo extraction using Workers AI binding
 */

interface ExtractedItem {
  title: string;
}

interface AIToolCallResponse {
  todos: Array<{
    title: string;
  }>;
}

const extractTodosTool = {
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
            },
            required: ["title"],
          },
        },
      },
      required: ["todos"],
    },
  },
};

function getSystemPrompt(): string {
  return `You are a helpful assistant that extracts actionable todo items from text.

Guidelines:
- Extract only clear, actionable tasks (things the user needs to DO)
- Start each todo with an action verb (Buy, Call, Email, Review, etc.)
- Keep titles concise but specific (5-10 words ideal)
- Don't create todos for general statements or observations
- Combine related items if they're clearly the same task

Examples of good extractions:
- "need to buy milk" -> "Buy milk"
- "should email the team about the meeting" -> "Email team about meeting"
- "the report is due Friday" -> "Complete report"`;
}

/**
 * Extract structured todos from natural language text using Workers AI via AI Gateway
 */
export async function extractTodos(
  ai: Ai,
  gatewayId: string,
  text: string,
): Promise<ExtractedItem[]> {
  const model = "@cf/moonshotai/kimi-k2.5" as keyof AiModels;
  const response = (await ai.run(
    model,
    {
      messages: [
        { role: "system", content: getSystemPrompt() },
        { role: "user", content: text },
      ],
      tools: [extractTodosTool],
      max_tokens: 16000,
    },
    {
      gateway: {
        id: gatewayId,
        skipCache: false,
      },
    },
  )) as AiTextGenerationOutput;

  // Extract tool call from response
  if (!("tool_calls" in response) || !response.tool_calls?.length) {
    console.error("No tool call in AI response", response);
    throw new Error("AI did not return extracted todos");
  }

  const toolCall = response.tool_calls[0];
  if (toolCall.name !== "extract_todos") {
    throw new Error("Unexpected tool call in AI response");
  }

  const parsed =
    typeof toolCall.arguments === "string"
      ? (JSON.parse(toolCall.arguments) as AIToolCallResponse)
      : (toolCall.arguments as unknown as AIToolCallResponse);

  return parsed.todos.map((todo) => ({
    title: todo.title,
  }));
}

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
      "Extract all actionable tasks, errands, or to-do items from the user's text. Convert any task-like statements into clear todo items with action verbs. If the user mentions things they need to do, buy, call, complete, schedule, or handle - extract them. Return them in the todos array. If there are truly no actionable items, return an empty array.",
    parameters: {
      type: "object",
      properties: {
        todos: {
          type: "array",
          description:
            "List of extracted todo items. Always populate this with any actionable tasks found in the text. Be liberal in what you consider actionable.",
          items: {
            type: "object",
            properties: {
              title: {
                type: "string",
                description:
                  "Concise action item starting with a verb (e.g., 'Buy milk', 'Call mom', 'Email team about Friday meeting', 'Review PR #123', 'Schedule dentist appointment')",
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

IMPORTANT: You MUST always call the extract_todos tool with your findings. Never respond with plain text - always use the tool.

Your job is to intelligently parse the user's text and extract ANY actionable tasks you find. The text may contain a mix of actionable items, random thoughts, lists, or conversational filler - your task is to identify and extract only the actionable parts.

Key principles:
- Be LIBERAL: If something sounds like a task, errand, reminder, or thing someone needs to do, extract it
- Handle mixed content: Text can contain both actionable and non-actionable items - only extract the actionable ones
- "Tell X to do Y" counts as a task for the user (they need to communicate the request)
- Partial matches are fine - extract what you can even if surrounded by irrelevant content

Look for mentions of:
- Buying, purchasing, getting, or picking up things
- Calling, emailing, texting, or contacting people
- Completing, finishing, or doing work
- Scheduling, booking, or making appointments
- Reminders or things not to forget
- Time words like "later", "tomorrow", "soon", "next week"

Examples (extract ALL of these):
- "need to buy milk" -> "Buy milk"
- "should email the team" -> "Email team"
- "call mom later" -> "Call mom"
- "pick up dry cleaning tomorrow" -> "Pick up dry cleaning"
- "don't forget to water plants" -> "Water plants"
- "finish the report" -> "Finish report"
- "grocery shopping" -> "Go grocery shopping"
- "meeting at 3pm" -> "Attend 3pm meeting"
- "buy milk and eggs" -> ["Buy milk", "Buy eggs"]
- "call john about the project and email the team" -> ["Call John about project", "Email team"]
- "puppies, kittens, other stuff also tell mum to get milk" -> "Tell mum to get milk"
- "random thoughts: need to call dentist" -> "Call dentist"`;
}

/**
 * Extract structured todos from natural language text using Workers AI via AI Gateway
 */
export async function extractTodos(
  ai: Ai,
  gatewayId: string,
  text: string,
): Promise<ExtractedItem[] | null> {
  const model = "@cf/moonshotai/kimi-k2.5" as keyof AiModels;
  const systemPrompt = getSystemPrompt();

  const response = (await ai.run(
    model,
    {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      tools: [extractTodosTool],
      tool_choice: {
        type: "function",
        function: { name: "extract_todos" },
      },
      max_tokens: 16000,
    },
    {
      gateway: {
        id: gatewayId,
        skipCache: true,
      },
    },
  )) as AiTextGenerationOutput;

  console.log("=== AI RAW RESPONSE ===");
  console.log(JSON.stringify(response, null, 2));

  // Handle both Workers AI native format and OpenAI-compatible format
  let toolCall: { name: string; arguments: string | object } | null = null;

  // Check for Workers AI native format (top-level tool_calls)
  if ("tool_calls" in response && response.tool_calls?.length) {
    const tc = response.tool_calls[0];
    if (tc?.name && tc.arguments !== undefined) {
      toolCall = {
        name: tc.name,
        arguments: tc.arguments as string | object,
      };
    }
  }
  // Check for OpenAI-compatible format (choices[0].message.tool_calls)
  else if (
    "choices" in response &&
    Array.isArray(response.choices) &&
    response.choices.length > 0
  ) {
    const firstChoice = response.choices[0];
    if (
      firstChoice &&
      typeof firstChoice === "object" &&
      "message" in firstChoice &&
      firstChoice.message &&
      typeof firstChoice.message === "object" &&
      "tool_calls" in firstChoice.message &&
      Array.isArray(firstChoice.message.tool_calls) &&
      firstChoice.message.tool_calls.length > 0
    ) {
      const tc = firstChoice.message.tool_calls[0];
      if (
        tc &&
        typeof tc === "object" &&
        tc.type === "function" &&
        tc.function &&
        tc.function.name === "extract_todos"
      ) {
        toolCall = {
          name: tc.function.name,
          arguments: tc.function.arguments,
        };
      }
    }
  }

  if (!toolCall) {
    console.error("No tool call found in AI response");
    console.error("Response structure:", Object.keys(response));
    throw new Error("AI did not return extracted todos");
  }

  console.log("=== TOOL CALL FOUND ===");
  console.log("Tool name:", toolCall.name);
  console.log("Arguments type:", typeof toolCall.arguments);
  console.log("Raw arguments:", toolCall.arguments);

  if (toolCall.name !== "extract_todos") {
    throw new Error(`Unexpected tool call: ${toolCall.name}`);
  }

  let parsed: AIToolCallResponse;
  try {
    parsed =
      typeof toolCall.arguments === "string"
        ? (JSON.parse(toolCall.arguments) as AIToolCallResponse)
        : (toolCall.arguments as AIToolCallResponse);
  } catch (e) {
    console.error("Failed to parse tool arguments:", toolCall.arguments);
    console.error("Parse error:", e);
    throw new Error("Failed to parse AI response");
  }

  console.log("=== PARSED RESPONSE ===");
  console.log("Todos count:", parsed.todos?.length ?? 0);
  console.log("Todos:", JSON.stringify(parsed.todos, null, 2));

  if (!parsed.todos || parsed.todos.length === 0) {
    console.log("AI returned empty todos array - falling back to single todo");
    return null;
  }

  return parsed.todos.map((todo) => ({
    title: todo.title,
  }));
}

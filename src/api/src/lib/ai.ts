/**
 * AI-powered todo extraction using Cloudflare AI Gateway with dynamic routing
 */

interface ExtractedItem {
  title: string;
  urls?: string[];
  dueDate?: string; // ISO date string YYYY-MM-DD
}

interface WorkersAIToolCallResponse {
  response: string | null;
  tool_calls?: Array<{
    name: string;
    arguments: {
      todos: Array<{
        title: string;
        urls?: string[];
        dueDate?: string;
      }>;
    };
  }>;
}

const extractTodosTool = {
  type: "function" as const,
  function: {
    name: "extract_todos",
    description:
      "Extract all actionable tasks, errands, or to-do items from the user's text. Convert any task-like statements into clear todo items with action verbs. If the user mentions things they need to do, buy, call, complete, schedule, or handle - extract them. Also extract any URLs mentioned and convert relative dates to ISO format. Return them in the todos array. If there are truly no actionable items, return an empty array.",
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
                  "Concise action item starting with a verb. Do NOT include raw URLs in the title - describe the action instead (e.g., 'Check Google' not 'check https://google.com')",
              },
              urls: {
                type: "array",
                description:
                  "Any URLs mentioned in relation to this task. Extract full URLs including protocol (http:// or https://)",
                items: {
                  type: "string",
                },
              },
              dueDate: {
                type: "string",
                description:
                  "Due date in ISO format (YYYY-MM-DD). Convert relative dates like 'tomorrow', 'next week', 'Friday' to absolute ISO dates based on today's date provided in the system prompt",
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
  const today = new Date().toISOString().split("T")[0];

  return `You are a helpful assistant that extracts actionable todo items from text.

Today's date is: ${today}

IMPORTANT: You MUST always call the extract_todos tool with your findings. Never respond with plain text - always use the tool.

Your job is to intelligently parse the user's text and extract ANY actionable tasks you find. The text may contain a mix of actionable items, random thoughts, lists, or conversational filler - your task is to identify and extract only the actionable parts.

Key principles:
- Be LIBERAL: If something sounds like a task, errand, reminder, or thing someone needs to do, extract it
- Handle mixed content: Text can contain both actionable and non-actionable items - only extract the actionable ones
- "Tell X to do Y" counts as a task for the user (they need to communicate the request)
- Partial matches are fine - extract what you can even if surrounded by irrelevant content
- Extract URLs: If a task mentions a URL, extract it into the urls array and describe the action in the title (don't put raw URLs in titles)
- Convert dates: Convert relative dates (tomorrow, next week, Friday, in 3 days) to ISO format YYYY-MM-DD based on today's date

Look for mentions of:
- Buying, purchasing, getting, or picking up things
- Calling, emailing, texting, or contacting people
- Completing, finishing, or doing work
- Scheduling, booking, or making appointments
- Reminders or things not to forget
- Time words like "later", "tomorrow", "soon", "next week"
- URLs (http:// or https://) related to tasks

Examples (extract ALL of these):
- "need to buy milk" -> { title: "Buy milk" }
- "should email the team" -> { title: "Email team" }
- "call mom later" -> { title: "Call mom" }
- "pick up dry cleaning tomorrow" -> { title: "Pick up dry cleaning", dueDate: "[tomorrow's date in YYYY-MM-DD]" }
- "don't forget to water plants" -> { title: "Water plants" }
- "finish the report by Friday" -> { title: "Finish report", dueDate: "[Friday's date in YYYY-MM-DD]" }
- "check https://google.com tomorrow" -> { title: "Check Google", urls: ["https://google.com"], dueDate: "[tomorrow's date]" }
- "review https://github.com/user/repo/pull/123" -> { title: "Review pull request", urls: ["https://github.com/user/repo/pull/123"] }
- "read article at https://example.com/post next week" -> { title: "Read article", urls: ["https://example.com/post"], dueDate: "[next week's date]" }
- "buy milk and eggs" -> [{ title: "Buy milk" }, { title: "Buy eggs" }]
- "call john about the project and email the team" -> [{ title: "Call John about project" }, { title: "Email team" }]
- "puppies, kittens, other stuff also tell mum to get milk" -> { title: "Tell mum to get milk" }
- "random thoughts: need to call dentist" -> { title: "Call dentist" }`;
}

/**
 * Extract structured todos from natural language text using Workers AI with AI Gateway
 */
export async function extractTodos(
  ai: Ai,
  text: string,
): Promise<ExtractedItem[] | null> {
  const systemPrompt = getSystemPrompt();

  // Model added recently, types not yet updated
  const response = await ai.run(
    "@cf/moonshotai/kimi-k2.5" as Parameters<typeof ai.run>[0],
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
        id: "nylon-impossible",
      },
    },
  );

  console.log("Workers AI response:", JSON.stringify(response, null, 2));

  const toolResponse = response as unknown as WorkersAIToolCallResponse;
  const toolCalls = toolResponse.tool_calls;

  if (!toolCalls?.length) {
    console.error("No tool call found in AI response");
    throw new Error("AI did not return extracted todos");
  }

  const tc = toolCalls[0];
  if (tc.name !== "extract_todos") {
    throw new Error(`Unexpected tool call: ${tc.name}`);
  }

  // Workers AI returns arguments already parsed, not as JSON string
  const parsed = tc.arguments;

  if (!parsed.todos || parsed.todos.length === 0) {
    return null;
  }

  return parsed.todos.map((todo) => {
    const item: ExtractedItem = { title: todo.title };
    if (todo.urls && todo.urls.length > 0) {
      item.urls = todo.urls;
    }
    if (todo.dueDate) {
      item.dueDate = todo.dueDate;
    }
    return item;
  });
}

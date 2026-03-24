import { AlertCircle } from "lucide-react";
import type { TodoWithUrls } from "@/types/database";
import { Checkbox, Textarea } from "./ui";

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const SEED_TODOS: TodoWithUrls[] = [
  {
    id: "mock-1",
    userId: "preview",
    title: "Finish quarterly report",
    description: "Needs sign-off from the finance team before end of month",
    completed: false,
    position: "a0",
    dueDate: "2026-03-28T00:00:00.000Z",
    priority: "high",
    createdAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    urls: [],
  },
  {
    id: "mock-2",
    userId: "preview",
    title: "Book dentist appointment",
    description: null,
    completed: false,
    position: "a1",
    dueDate: "2026-03-19T00:00:00.000Z",
    priority: null,
    createdAt: "2026-03-15T10:00:00.000Z",
    updatedAt: "2026-03-15T10:00:00.000Z",
    urls: [],
  },
  {
    id: "mock-3",
    userId: "preview",
    title: "Read 'Atomic Habits'",
    description: null,
    completed: false,
    position: "a2",
    dueDate: null,
    priority: "low",
    createdAt: "2026-03-10T10:00:00.000Z",
    updatedAt: "2026-03-10T10:00:00.000Z",
    urls: [],
  },
  {
    id: "mock-4",
    userId: "preview",
    title: "Buy groceries for the week",
    description: null,
    completed: true,
    position: "a3",
    dueDate: null,
    priority: null,
    createdAt: "2026-03-22T10:00:00.000Z",
    updatedAt: "2026-03-22T14:00:00.000Z",
    urls: [],
  },
];

// ---------------------------------------------------------------------------
// Todo item
// ---------------------------------------------------------------------------

function TodoIndicators({ todo }: { todo: TodoWithUrls }) {
  const hasDueDate = !!todo.dueDate;
  const hasPriority = todo.priority === "high" || todo.priority === "low";
  if (!hasDueDate && !hasPriority) return null;

  const dueDate = todo.dueDate ? new Date(todo.dueDate) : null;
  const isOverdue = dueDate && dueDate < new Date() && !todo.completed;

  return (
    <div className="flex items-center gap-1.5 mt-1">
      {hasPriority && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-md ${
            todo.priority === "high"
              ? "bg-yellow-base text-yellow-muted"
              : "bg-gray-base text-gray-muted"
          }`}
        >
          {todo.priority === "high" ? "High" : "Low"}
        </span>
      )}
      {hasDueDate && dueDate && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1 ${
            isOverdue
              ? "bg-red-base text-red-muted"
              : "bg-gray-base text-gray-muted"
          }`}
        >
          {isOverdue && <AlertCircle size={10} />}
          {dueDate.toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

function MockTodoItem({ todo }: { todo: TodoWithUrls }) {
  return (
    <div className="py-3 flex items-center gap-3">
      <div className="pt-0.5">
        <Checkbox checked={todo.completed} aria-label={todo.title} />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-snug break-words ${
            todo.completed ? "line-through text-gray-muted" : "text-gray"
          }`}
        >
          {todo.title}
        </p>
        <TodoIndicators todo={todo} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppMock
// ---------------------------------------------------------------------------

const incompleteTodos = SEED_TODOS.filter((t) => !t.completed);
const completedTodos = SEED_TODOS.filter((t) => t.completed);

export function AppMock() {
  return (
    <div className="container max-w-xl mx-auto py-8 px-4">
      <div className="space-y-4">
        <div className="bg-gray-surface shadow-base rounded-lg">
          <Textarea
            placeholder="What needs to be done?"
            aria-label="New todo"
            rows={1}
            readOnly
            className="w-full resize-none min-h-0"
          />
        </div>

        <div className="divide-y divide-gray-subtle">
          {incompleteTodos.map((todo) => (
            <MockTodoItem key={todo.id} todo={todo} />
          ))}
          {completedTodos.map((todo) => (
            <MockTodoItem key={todo.id} todo={todo} />
          ))}
        </div>
      </div>
    </div>
  );
}

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import { AlertCircle, ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { useState } from "react";
import { TodoItemExpanded } from "@/components/TodoItemExpanded";
import type { TodoWithUrls } from "@/types/database";
import { Button, Checkbox, Loader, Textarea } from "./ui";

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
// Indicators
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
              ? "bg-yellow-base hover:bg-yellow-hover active:bg-yellow-active text-yellow-muted"
              : "bg-gray-base hover:bg-gray-hover active:bg-gray-active text-gray-muted"
          }`}
        >
          {todo.priority === "high" ? "High" : "Low"}
        </span>
      )}
      {hasDueDate && dueDate && (
        <span
          className={`text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1 ${
            isOverdue
              ? "bg-red-base hover:bg-red-hover active:bg-red-active text-red-muted"
              : "bg-gray-base hover:bg-gray-hover active:bg-gray-active text-gray-muted"
          }`}
        >
          {isOverdue && <AlertCircle size={10} />}
          {dueDate.toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Todo item
// ---------------------------------------------------------------------------

interface MockTodoItemProps {
  todo: TodoWithUrls;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onUpdate: (
    id: string,
    updates: {
      title?: string;
      description?: string | null;
      dueDate?: Date | null;
      priority?: "high" | "low" | null;
    },
  ) => void;
}

function MockTodoItemContent({
  todo,
  isExpanded,
  onToggle,
  onDelete,
  onToggleExpand,
}: Omit<MockTodoItemProps, "onUpdate">) {
  return (
    <div className="flex items-center gap-3">
      <div className="pt-0.5">
        <Checkbox
          checked={todo.completed}
          onCheckedChange={() => onToggle(todo.id)}
          aria-label={
            todo.completed
              ? `Mark "${todo.title}" as not completed`
              : `Mark "${todo.title}" as completed`
          }
        />
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
      <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => onToggleExpand(todo.id)}
          aria-label={isExpanded ? "Collapse details" : "Expand details"}
        >
          Edit
          {isExpanded ? (
            <ChevronUp size={14} className="ml-1" />
          ) : (
            <ChevronDown size={14} className="ml-1" />
          )}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          type="button"
          onClick={() => onDelete(todo.id)}
          aria-label={`Delete "${todo.title}"`}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}

function SortableMockTodoItem(props: MockTodoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.todo.id });

  const style = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition: isDragging ? "none" : transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="py-3 group">
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="pt-1.75 cursor-grab active:cursor-grabbing text-gray-muted hover:text-gray touch-none"
          aria-label={`Reorder "${props.todo.title}"`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <MockTodoItemContent {...props} />
          {props.isExpanded && !isDragging && (
            <TodoItemExpanded
              todo={props.todo}
              onUpdate={(updates) => props.onUpdate(props.todo.id, updates)}
              isUpdating={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mock input
// ---------------------------------------------------------------------------

function MockTodoInput({
  onAdd,
}: {
  onAdd: (title: string) => void;
}) {
  const [text, setText] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isPending) return;

    setIsPending(true);
    setTimeout(() => {
      onAdd(trimmed);
      setText("");
      setIsPending(false);
      setFeedback("Added");
      setTimeout(() => setFeedback(null), 2000);
    }, 600);
  };

  return (
    <div className="space-y-2">
      {feedback && <p className="text-sm text-gray-muted">{feedback}</p>}
      <form onSubmit={handleSubmit}>
        <div className="relative bg-gray-surface shadow-base rounded-lg">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs to be done?"
            aria-label="New todo"
            disabled={isPending}
            rows={1}
            className="w-full resize-none min-h-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          {isPending && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader size="sm" className="text-gray-muted" />
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppMock
// ---------------------------------------------------------------------------

let nextId = 100;

export function AppMock() {
  const [todos, setTodos] = useState<TodoWithUrls[]>(SEED_TODOS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localIncompleteTodos, setLocalIncompleteTodos] = useState<
    TodoWithUrls[] | null
  >(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sortedTodos = [...todos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (!a.completed) {
      if (a.position < b.position) return -1;
      if (a.position > b.position) return 1;
      return 0;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const incompleteTodos = sortedTodos.filter((t) => !t.completed);
  const completedTodos = sortedTodos.filter((t) => t.completed);
  const displayIncompleteTodos = localIncompleteTodos ?? incompleteTodos;
  const activeItem = activeId
    ? (displayIncompleteTodos.find((t) => t.id === activeId) ?? null)
    : null;

  const handleToggle = (id: string) => {
    const now = new Date().toISOString();
    setTodos((prev) =>
      prev.map((t) =>
        t.id !== id ? t : { ...t, completed: !t.completed, updatedAt: now },
      ),
    );
    setLocalIncompleteTodos(null);
  };

  const handleDelete = (id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    setLocalIncompleteTodos(null);
  };

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleUpdate = (
    id: string,
    updates: {
      title?: string;
      description?: string | null;
      dueDate?: Date | null;
      priority?: "high" | "low" | null;
    },
  ) => {
    const now = new Date().toISOString();
    setTodos((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return {
          ...t,
          ...(updates.title !== undefined && { title: updates.title }),
          ...(updates.description !== undefined && {
            description: updates.description,
          }),
          ...(updates.dueDate !== undefined && {
            dueDate: updates.dueDate?.toISOString() ?? null,
          }),
          ...(updates.priority !== undefined && { priority: updates.priority }),
          updatedAt: now,
        };
      }),
    );
  };

  const handleAdd = (title: string) => {
    const lastPosition =
      displayIncompleteTodos.length > 0
        ? displayIncompleteTodos[displayIncompleteTodos.length - 1].position
        : null;
    const position = generateKeyBetween(lastPosition ?? null, null);
    const now = new Date().toISOString();
    const newTodo: TodoWithUrls = {
      id: `mock-${++nextId}`,
      userId: "preview",
      title,
      description: null,
      completed: false,
      position,
      dueDate: null,
      priority: null,
      createdAt: now,
      updatedAt: now,
      urls: [],
    };
    setTodos((prev) => [...prev, newTodo]);
    setLocalIncompleteTodos(null);
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id as string);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    const currentItems = localIncompleteTodos ?? incompleteTodos;
    const oldIndex = currentItems.findIndex((t) => t.id === active.id);
    const newIndex = currentItems.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(currentItems, oldIndex, newIndex);
    setLocalIncompleteTodos(reordered);

    const prev = newIndex > 0 ? reordered[newIndex - 1].position : null;
    const next =
      newIndex < reordered.length - 1 ? reordered[newIndex + 1].position : null;
    const newPosition = generateKeyBetween(prev ?? null, next ?? null);

    setTodos((prevTodos) =>
      prevTodos.map((t) =>
        t.id === active.id ? { ...t, position: newPosition } : t,
      ),
    );
  };

  const sharedProps = (todo: TodoWithUrls) => ({
    todo,
    isExpanded: expandedId === todo.id,
    onToggle: handleToggle,
    onDelete: handleDelete,
    onToggleExpand: handleToggleExpand,
    onUpdate: handleUpdate,
  });

  return (
    <div className="container max-w-xl mx-auto py-8 px-4">
      <div className="space-y-4">
        <MockTodoInput onAdd={handleAdd} />

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="divide-y divide-gray-subtle">
            <SortableContext
              items={displayIncompleteTodos.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {displayIncompleteTodos.map((todo) => (
                <SortableMockTodoItem key={todo.id} {...sharedProps(todo)} />
              ))}
            </SortableContext>

            {activeItem && (
              <div
                className="py-3 bg-gray-surface shadow-lg rounded-lg opacity-95 pointer-events-none"
                aria-hidden="true"
              >
                <div className="flex items-start gap-2">
                  <div className="pt-1 cursor-grabbing text-gray-muted">
                    <GripVertical size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <MockTodoItemContent {...sharedProps(activeItem)} />
                  </div>
                </div>
              </div>
            )}

            {completedTodos.map((todo) => (
              <div key={todo.id} className="py-3 group">
                <MockTodoItemContent {...sharedProps(todo)} />
                {expandedId === todo.id && (
                  <TodoItemExpanded
                    todo={todo}
                    onUpdate={(updates) => handleUpdate(todo.id, updates)}
                    isUpdating={false}
                  />
                )}
              </div>
            ))}
          </div>
        </DndContext>
      </div>
    </div>
  );
}

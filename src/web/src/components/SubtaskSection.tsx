import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  type Modifier,
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
import { GripVertical, ListTree, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { TodoWithUrls } from "@/types/database";
import { Button, Checkbox, Input } from "./ui";

// Single-column list — lock dragging to the Y axis so the lifted row doesn't
// drift sideways.
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

interface SubtaskRowProps {
  subtask: TodoWithUrls;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  disabled: boolean;
}

/** A completed subtask: pinned at the bottom, not reorderable. */
function CompletedSubtaskRow({
  subtask,
  onToggle,
  onDelete,
  disabled,
}: SubtaskRowProps) {
  return (
    <div className="group/sub flex items-center gap-2 py-1 pl-6">
      <Checkbox
        checked
        onCheckedChange={() => onToggle(subtask.id, true)}
        disabled={disabled}
        variant="subtle"
        aria-label={`Mark "${subtask.title}" as not completed`}
      />
      <span className="min-w-0 flex-1 wrap-anywhere text-xs text-gray-muted line-through">
        {subtask.title}
      </span>
      <Button
        variant="ghost"
        size="xs"
        shape="square"
        type="button"
        onClick={() => onDelete(subtask.id)}
        disabled={disabled}
        aria-label={`Delete subtask "${subtask.title}"`}
        className="text-gray-muted opacity-0 transition-opacity hover:text-red group-hover/sub:opacity-100"
      >
        <Trash2 size={13} />
      </Button>
    </div>
  );
}

/** An active subtask: reorderable within the sibling group. */
function ActiveSubtaskRow({
  subtask,
  onToggle,
  onDelete,
  disabled,
}: SubtaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: subtask.id });
  const style = { transform: CSS.Translate.toString(transform) };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/sub flex items-center gap-1.5 rounded-lg py-1 ${
        isDragging
          ? "z-10 bg-gray-surface/80 shadow-base ring-1 ring-gray-subtle backdrop-blur-sm"
          : ""
      }`}
    >
      <button
        type="button"
        disabled={disabled}
        className="cursor-grab touch-none text-gray-muted/40 transition-[transform,opacity,color] hover:text-gray-muted active:scale-[0.96] active:cursor-grabbing sm:opacity-0 sm:group-hover/sub:opacity-100 disabled:opacity-50"
        aria-label={`Reorder "${subtask.title}"`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} className="block" />
      </button>
      <Checkbox
        checked={false}
        onCheckedChange={() => onToggle(subtask.id, false)}
        disabled={disabled}
        aria-label={`Mark "${subtask.title}" as completed`}
      />
      <span className="min-w-0 flex-1 wrap-anywhere text-sm text-gray">
        {subtask.title}
      </span>
      <Button
        variant="ghost"
        size="xs"
        shape="square"
        type="button"
        onClick={() => onDelete(subtask.id)}
        disabled={disabled}
        aria-label={`Delete subtask "${subtask.title}"`}
        className="text-gray-muted opacity-0 transition-opacity hover:text-red group-hover/sub:opacity-100"
      >
        <Trash2 size={13} />
      </Button>
    </div>
  );
}

interface SubtaskSectionProps {
  parentId: string;
  subtasks: TodoWithUrls[];
  onAdd: (parentId: string, title: string, position?: string) => void;
  onToggle: (id: string, completed: boolean) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, position: string) => void;
  disabled?: boolean;
}

export function SubtaskSection({
  parentId,
  subtasks,
  onAdd,
  onToggle,
  onDelete,
  onReorder,
  disabled = false,
}: SubtaskSectionProps) {
  const [newTitle, setNewTitle] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Active subtasks order by position; completed sink to the bottom and are not
  // reorderable.
  // Fractional-index keys are ASCII, so compare by codepoint (not locale). The
  // 0 case keeps equal positions stable instead of forcing a reorder.
  const byPosition = (a: TodoWithUrls, b: TodoWithUrls) =>
    a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
  const active = subtasks.filter((s) => !s.completed).sort(byPosition);
  const completed = subtasks.filter((s) => s.completed).sort(byPosition);
  const done = completed.length;
  const total = subtasks.length;

  const handleAdd = () => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    // Insert at the top of the active subtask list: a key before the current
    // first active subtask (or null/null when the list is empty).
    const position = generateKeyBetween(null, active[0]?.position ?? null);
    onAdd(parentId, trimmed, position);
    setNewTitle("");
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const oldIndex = active.findIndex((s) => s.id === dragged.id);
    const newIndex = active.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(active, oldIndex, newIndex);
    const prev = newIndex > 0 ? reordered[newIndex - 1].position : null;
    const next =
      newIndex < reordered.length - 1 ? reordered[newIndex + 1].position : null;
    onReorder(dragged.id as string, generateKeyBetween(prev, next));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs font-medium text-gray-muted">
          <ListTree size={12} />
          Subtasks
        </span>
        {total > 0 && (
          <span className="rounded-md bg-gray-base px-1.5 py-0.5 text-xs tabular-nums text-gray-muted">
            {done}/{total}
          </span>
        )}
      </div>

      <div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={active.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {active.map((subtask) => (
              <ActiveSubtaskRow
                key={subtask.id}
                subtask={subtask}
                onToggle={onToggle}
                onDelete={onDelete}
                disabled={disabled}
              />
            ))}
          </SortableContext>
        </DndContext>

        {completed.map((subtask) => (
          <CompletedSubtaskRow
            key={subtask.id}
            subtask={subtask}
            onToggle={onToggle}
            onDelete={onDelete}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Add subtask */}
      <div className="flex items-center gap-1.5 pl-6">
        <Input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a subtask..."
          className="flex-1 min-w-0"
          inputSize="sm"
          disabled={disabled}
        />
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          type="button"
          onClick={handleAdd}
          disabled={disabled || !newTitle.trim()}
          aria-label="Add subtask"
        >
          <Plus size={14} />
        </Button>
      </div>
    </div>
  );
}

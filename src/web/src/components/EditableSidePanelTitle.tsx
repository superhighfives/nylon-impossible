import { useEffect, useState } from "react";
import type { TodoWithUrls } from "@/types/database";

/**
 * The SidePanel's title, editable in place — replaces the old separate
 * "Title" field inside the expanded panel body, which just duplicated this
 * same text. Autosaves on blur / Enter, same instantly-reversible pattern as
 * the rest of the panel's discrete fields.
 */
export function EditableSidePanelTitle({
  todo,
  onUpdate,
}: {
  todo: TodoWithUrls;
  onUpdate: (updates: { title?: string }) => void;
}) {
  const [title, setTitle] = useState(todo.title);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!touched) setTitle(todo.title);
  }, [todo.title, touched]);

  const commit = () => {
    setTouched(false);
    const trimmed = title.trim();
    if (!trimmed || trimmed === todo.title) {
      setTitle(todo.title);
      return;
    }
    onUpdate({ title: trimmed });
  };

  return (
    <input
      value={title}
      onChange={(e) => {
        setTitle(e.target.value);
        setTouched(true);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      aria-label="Todo title"
      className="min-w-0 flex-1 truncate bg-transparent text-sm font-medium text-gray outline-none"
    />
  );
}

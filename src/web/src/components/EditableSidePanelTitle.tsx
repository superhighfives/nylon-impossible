import { useEffect, useState } from "react";
import { isPlaceholderTitle, placeholderTitleForUrl } from "@/lib/url-display";
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

  const singleLinkedUrl = todo.urls.length === 1 ? todo.urls[0] : null;

  const commit = () => {
    setTouched(false);
    const trimmed = title.trim();
    if (trimmed === todo.title) {
      setTitle(todo.title);
      return;
    }
    if (!trimmed) {
      // Clearing the title of a single-link todo is how you get back to
      // "just the link" — it saves the placeholder rather than silently
      // reverting, since there's no title-less state to fall back to.
      if (singleLinkedUrl) {
        const placeholder = placeholderTitleForUrl(singleLinkedUrl.url);
        setTitle(placeholder);
        if (placeholder !== todo.title) onUpdate({ title: placeholder });
        return;
      }
      setTitle(todo.title);
      return;
    }
    onUpdate({ title: trimmed });
  };

  const isPlaceholder =
    !!singleLinkedUrl && isPlaceholderTitle(title, singleLinkedUrl.url);

  return (
    <textarea
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
      rows={1}
      aria-label="Todo title"
      className={`field-sizing-content min-w-0 flex-1 resize-none rounded-md bg-transparent text-sm font-medium leading-snug outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-inset ${
        isPlaceholder ? "text-gray-muted" : "text-gray"
      }`}
    />
  );
}

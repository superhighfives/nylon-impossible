import { type ReactNode, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  type Block,
  type Inline,
  type List,
  parseMarkdown,
} from "@/lib/markdown";

/**
 * A blank line in the notes keeps its height when they're drawn: one line,
 * as in the editor, so switching between the two moves nothing but the
 * text (principle 8).
 */
const GAP = "mt-[1lh]";

const LINK =
  "rounded-[0.125rem] text-n-ink underline decoration-n-ink-subtle underline-offset-2 n-focus pointer-fine:hover:decoration-n-ink";

function inlines(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "text":
        return node.text;
      case "br":
        // biome-ignore lint/suspicious/noArrayIndexKey: parsed fresh from the text each render
        return <br key={i} />;
      case "code":
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: parsed fresh from the text each render
          <code key={i} className="rounded-[0.25rem] bg-n-fill px-1">
            {node.text}
          </code>
        );
      case "strong":
        // biome-ignore lint/suspicious/noArrayIndexKey: parsed fresh from the text each render
        return <strong key={i}>{inlines(node.children)}</strong>;
      case "em":
        // biome-ignore lint/suspicious/noArrayIndexKey: parsed fresh from the text each render
        return <em key={i}>{inlines(node.children)}</em>;
      default:
        // A link.
        return (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: parsed fresh from the text each render
            key={i}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK}
          >
            {inlines(node.children)}
          </a>
        );
    }
  });
}

function list(node: List, nested: boolean, className: string, key?: number) {
  const items = node.items.map((item, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: parsed fresh from the text each render
    <li key={i} className={item.gap ? GAP : undefined}>
      {inlines(item.children)}
      {item.list && list(item.list, true, "")}
    </li>
  ));
  const shape = node.ordered
    ? "list-decimal"
    : nested
      ? "list-[circle]"
      : "list-disc";
  const classes = `m-0 pl-5 ${shape} ${className}`;
  return node.ordered ? (
    <ol key={key} start={node.start} className={classes}>
      {items}
    </ol>
  ) : (
    <ul key={key} className={classes}>
      {items}
    </ul>
  );
}

function blocks(nodes: Block[]): ReactNode[] {
  return nodes.map((node, i) => {
    const gap = node.gap ? GAP : "";
    switch (node.type) {
      case "paragraph":
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: parsed fresh from the text each render
          <p key={i} className={`m-0 ${gap}`}>
            {inlines(node.children)}
          </p>
        );
      case "heading": {
        // Body-sized, so a note never outshouts the todo's title.
        const Heading = (["h3", "h4", "h5"] as const)[node.level - 1];
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: parsed fresh from the text each render
          <Heading key={i} className={`m-0 font-bold text-inherit ${gap}`}>
            {inlines(node.children)}
          </Heading>
        );
      }
      case "code":
        return (
          <pre
            // biome-ignore lint/suspicious/noArrayIndexKey: parsed fresh from the text each render
            key={i}
            className={`m-0 rounded-n-chip bg-n-fill px-2 break-words whitespace-pre-wrap ${gap}`}
          >
            <code>{node.text}</code>
          </pre>
        );
      case "quote":
        return (
          <blockquote
            // biome-ignore lint/suspicious/noArrayIndexKey: parsed fresh from the text each render
            key={i}
            className={`m-0 border-l-2 border-n-hairline pl-3 text-n-ink-muted ${gap}`}
          >
            {blocks(node.blocks)}
          </blockquote>
        );
      default:
        return list(node, false, gap, i);
    }
  });
}

/** Notes as formatted text. */
export function NotesMarkdown({ text }: { text: string }) {
  const tree = useMemo(() => parseMarkdown(text), [text]);
  return <>{blocks(tree)}</>;
}

/**
 * The open todo's Notes: drawn as Markdown while you aren't editing them,
 * the plain text you typed while you are. A click (anywhere but a link) or
 * Return edits, with the caret at the end; blur or Esc draws them again, and
 * Esc leaves the keyboard on them. Empty notes are always the editor, with
 * its "Add notes" placeholder. The stored string is only ever what was typed.
 */
export function Notes({
  value,
  onChange,
  onBlur,
  label,
  rows,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Saves what's been typed. */
  onBlur: () => void;
  /** The "Notes" label's classes. */
  label: string;
  rows: number;
  /** Type and height, shared by the editor and the drawn notes. */
  className: string;
}) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const shown = useRef<HTMLDivElement>(null);
  const empty = value.trim() === "";

  const edit = () => {
    flushSync(() => setEditing(true));
    const field = editor.current;
    if (!field) return;
    // Focused here, in the click or key press, so a phone shows its keyboard.
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  };

  return (
    <div>
      {editing || empty ? (
        <>
          <label htmlFor={id} className={label}>
            Notes
          </label>
          <textarea
            id={id}
            ref={editor}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setEditing(true)}
            onBlur={() => {
              onBlur();
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Escape") return;
              // Esc leaves the notes, not the sheet.
              e.preventDefault();
              e.stopPropagation();
              onBlur();
              if (empty) {
                e.currentTarget.blur();
                return;
              }
              flushSync(() => setEditing(false));
              shown.current?.focus();
            }}
            placeholder="Add notes"
            rows={rows}
            className={`field-sizing-content block w-full resize-none rounded-n-chip bg-transparent p-0 text-n-ink n-focus placeholder:text-n-ink-muted ${className}`}
          />
        </>
      ) : (
        <>
          <span id={id} className={label}>
            Notes
          </span>
          {/* Focusable like the field it stands for: a click (but not on a
              link, or after selecting text to copy) or Return edits. */}
          {/* biome-ignore lint/a11y/useSemanticElements: a textbox can't hold the links */}
          <div
            ref={shown}
            role="textbox"
            aria-readonly="true"
            aria-multiline="true"
            aria-labelledby={id}
            aria-description="Return to edit"
            tabIndex={0}
            data-notes-rendered
            onClick={(e) => {
              if ((e.target as Element).closest("a")) return;
              const selection = window.getSelection();
              if (selection && !selection.isCollapsed) return;
              edit();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.target !== e.currentTarget) return;
              e.preventDefault();
              e.stopPropagation();
              edit();
            }}
            className={`block w-full cursor-text rounded-n-chip p-0 break-words text-n-ink n-focus ${className}`}
          >
            <NotesMarkdown text={value} />
          </div>
        </>
      )}
    </div>
  );
}

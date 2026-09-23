import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentProps, ReactNode } from "react";
import { Fragment, useEffect, useRef, useState } from "react";

export interface FieldProps extends ComponentProps<typeof BaseField.Root> {
  label?: string;
  description?: ReactNode;
  error?: { message?: string };
}

export function Field({
  children,
  label,
  description,
  error,
  className,
  ...props
}: FieldProps) {
  return (
    <BaseField.Root
      className={`flex flex-col gap-1 ${className ?? ""}`}
      {...props}
    >
      {label && (
        <BaseField.Label className="text-sm font-medium text-gray">
          {label}
        </BaseField.Label>
      )}
      {children}
      {description && !error && (
        <BaseField.Description className="text-xs text-gray-muted">
          {description}
        </BaseField.Description>
      )}
      {error?.message && (
        <BaseField.Error className="text-xs text-red-muted">
          {error.message}
        </BaseField.Error>
      )}
    </BaseField.Root>
  );
}

export interface TextareaProps extends ComponentProps<"textarea"> {
  variant?: "default" | "error";
  /** Tailwind min-h-* utility to use instead of the default 80px. */
  minHeightClassName?: string;
}

export function Textarea({
  className,
  variant = "default",
  minHeightClassName = "min-h-[80px]",
  ...props
}: TextareaProps) {
  const variantClasses = {
    default: "ring-1 ring-gray-subtle focus-visible:ring-accent-strong",
    error: "ring-1 ring-red focus-visible:ring-red-strong",
  };

  return (
    <textarea
      className={`flex ${minHeightClassName} w-full rounded-lg bg-gray-surface px-3 py-2 text-sm text-gray placeholder:text-gray-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-app disabled:cursor-not-allowed disabled:opacity-50 [@supports(-webkit-touch-callout:none)]:!text-base ${variantClasses[variant]} ${className ?? ""}`}
      {...props}
    />
  );
}

// Matches [label](url), **bold**, *italic*/_italic_, or a bare http(s) URL
// as one token; everything else falls through as plain text between matches.
// The markdown-link alternative is listed first so it wins at its start
// position — otherwise the bare-URL alternative would swallow the URL
// inside the parens as its own token.
const INLINE_TOKEN_RE =
  /(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|https?:\/\/[^\s]+)/g;

const MARKDOWN_LINK_RE = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/;

function renderLink(key: string, href: string, label: string): ReactNode {
  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="underline decoration-gray-subtle underline-offset-2 hover:decoration-gray"
    >
      {label}
    </a>
  );
}

function renderInline(line: string, keyPrefix: string): ReactNode[] {
  return line
    .split(INLINE_TOKEN_RE)
    .filter((token) => token.length > 0)
    .map((token, i) => {
      const key = `${keyPrefix}-${i}`;
      const linkMatch = token.match(MARKDOWN_LINK_RE);
      if (linkMatch) {
        return renderLink(key, linkMatch[2], linkMatch[1]);
      }
      if (/^\*\*[^*]+\*\*$/.test(token)) {
        return <strong key={key}>{token.slice(2, -2)}</strong>;
      }
      if (/^\*[^*]+\*$/.test(token) || /^_[^_]+_$/.test(token)) {
        return <em key={key}>{token.slice(1, -1)}</em>;
      }
      if (/^https?:\/\//.test(token)) {
        return renderLink(key, token, token);
      }
      return token;
    });
}

function renderNotes(value: string): ReactNode {
  const lines = value.split("\n");
  return lines.map((line, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: lines only reorder by editing the text itself, which re-renders everything anyway.
    <Fragment key={i}>
      {renderInline(line, String(i))}
      {i < lines.length - 1 && <br />}
    </Fragment>
  ));
}

export interface EditableTextProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Tailwind min-h-* utility to use instead of the default 80px. */
  minHeightClassName?: string;
  className?: string;
}

/**
 * Plain text while focused (an auto-growing textarea), simple markdown
 * (bold, italic, auto-linked URLs) once it loses focus — Notion/Bear-style
 * editing rather than a WYSIWYG rich-text box.
 */
export function EditableText({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  minHeightClassName = "min-h-[80px]",
  className,
}: EditableTextProps) {
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow to fit content instead of scrolling inside a fixed box.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  if (focused) {
    return (
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        // biome-ignore lint/a11y/noAutofocus: this only mounts by replacing the rendered view the user just clicked/focused into, not on page load.
        autoFocus
        rows={1}
        onChange={(e) => {
          onChange(e.target.value);
          const el = e.target;
          el.style.height = "auto";
          el.style.height = `${el.scrollHeight}px`;
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        placeholder={placeholder}
        className={`block ${minHeightClassName} w-full resize-none overflow-hidden bg-transparent p-0 text-sm leading-relaxed text-gray placeholder:text-gray-muted transition-colors focus-visible:outline-none [@supports(-webkit-touch-callout:none)]:!text-base ${className ?? ""}`}
      />
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: this toggles into a textarea on activation; it isn't a native control itself.
    <div
      id={id}
      tabIndex={0}
      role="textbox"
      aria-multiline="true"
      onFocus={() => setFocused(true)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a")) return;
        setFocused(true);
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setFocused(true);
        }
      }}
      className={`block ${minHeightClassName} w-full cursor-text text-sm leading-relaxed text-gray whitespace-pre-wrap break-words transition-colors focus-visible:outline-none ${className ?? ""}`}
    >
      {value ? (
        renderNotes(value)
      ) : (
        <span className="text-gray-muted">{placeholder}</span>
      )}
    </div>
  );
}

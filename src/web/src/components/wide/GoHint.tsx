const KEYS = [
  ["G", "Go to"],
  ["T", "Today"],
  ["W", "This week"],
  ["S", "Someday"],
  ["D", "Done"],
  ["L", "Lists"],
] as const;

/** The card that shows after G, until the next key or 1.2 seconds. */
export function GoHint() {
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 animate-n-fade-in items-center gap-3 rounded-[0.75rem] border border-n-hairline bg-n-surface px-4 py-2.5 text-[0.8125rem] text-n-ink-muted shadow-[0_10px_30px_color-mix(in_srgb,black_14%,transparent)]"
    >
      {KEYS.map(([key, label]) => (
        <span key={key} className="flex items-center gap-1.5">
          <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-n-chip border border-n-hairline bg-n-canvas px-1.5 font-n-text font-medium text-n-ink">
            {key}
          </kbd>
          {label}
        </span>
      ))}
    </div>
  );
}

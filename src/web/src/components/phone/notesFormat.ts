/**
 * ⌘B, ⌘I and ⌘E in the notes editor: wrap the selection in Markdown bold,
 * italic or inline code, or insert the pair at the caret. On a selection
 * that's already wrapped, just inside or just outside it, they unwrap it.
 * Pure, so the iPhone can follow the same rules, tested with the same cases.
 */

export type NotesMarker = "**" | "*" | "`";

/** The shortcut letters, ⌘ on a Mac and Ctrl elsewhere. */
export const NOTES_SHORTCUTS = new Map<string, NotesMarker>([
  ["b", "**"],
  ["i", "*"],
  ["e", "`"],
]);

/** Replace `from`–`to` with `insert`, then select `selectionStart`–`selectionEnd`. */
export interface NotesEdit {
  from: number;
  to: number;
  insert: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Whether a run of `count` marker characters carries the marker. Stars are
 * shared: `**` is bold and `*` italic, so `***` is both, and ⌘I on `**bold**`
 * leaves its markers alone.
 */
function carries(marker: NotesMarker, count: number): boolean {
  if (marker === "**") return count >= 2;
  if (marker === "*") return count % 2 === 1;
  return count >= 1;
}

const runBefore = (text: string, at: number, char: string) => {
  let n = 0;
  while (at - n > 0 && text[at - n - 1] === char) n++;
  return n;
};

const runAfter = (text: string, at: number, char: string) => {
  let n = 0;
  while (at + n < text.length && text[at + n] === char) n++;
  return n;
};

/**
 * The edit a shortcut makes to `value` with `start`–`end` selected, or null
 * when wrapping would pass `max` characters: like typing at the limit, it
 * does nothing, rather than leave half a pair.
 */
export function toggleMarker(
  value: string,
  start: number,
  end: number,
  marker: NotesMarker,
  max: number,
): NotesEdit | null {
  const char = marker[0];
  const size = marker.length;
  const selected = value.slice(start, end);

  // Inside the selection: `**bold**` selected whole.
  if (selected.length >= size * 2) {
    const lead = Math.min(runAfter(selected, 0, char), selected.length - size);
    const trail = Math.min(
      runBefore(selected, selected.length, char),
      selected.length - size,
    );
    if (carries(marker, lead) && carries(marker, trail)) {
      const inner = selected.slice(size, selected.length - size);
      return {
        from: start,
        to: end,
        insert: inner,
        selectionStart: start,
        selectionEnd: start + inner.length,
      };
    }
  }

  // Just outside it: `bold` selected in `**bold**`, or the caret in `**|**`.
  if (
    carries(marker, runBefore(value, start, char)) &&
    carries(marker, runAfter(value, end, char))
  ) {
    return {
      from: start - size,
      to: end + size,
      insert: selected,
      selectionStart: start - size,
      selectionEnd: end - size,
    };
  }

  if (value.length + size * 2 > max) return null;
  return {
    from: start,
    to: end,
    insert: `${marker}${selected}${marker}`,
    selectionStart: start + size,
    selectionEnd: end + size,
  };
}

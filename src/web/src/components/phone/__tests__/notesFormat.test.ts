import { describe, expect, it } from "vitest";
import { applyNotesEdit, type NotesMarker, toggleMarker } from "../notesFormat";

const MAX = 100_000;

/**
 * `text` with the selection marked by `[` and `]` (or a lone `|` for the
 * caret), after the shortcut, in the same notation.
 */
function press(text: string, marker: NotesMarker, max = MAX): string | null {
  const caret = text.indexOf("|");
  const start = caret >= 0 ? caret : text.indexOf("[");
  const end = caret >= 0 ? caret : text.indexOf("]") - 1;
  const value = text.replace(/[[\]|]/g, "");
  const edit = toggleMarker(value, start, end, marker, max);
  if (!edit) return null;
  const next = applyNotesEdit(value, edit);
  if (edit.selectionStart === edit.selectionEnd) {
    return `${next.slice(0, edit.selectionStart)}|${next.slice(edit.selectionStart)}`;
  }
  return `${next.slice(0, edit.selectionStart)}[${next.slice(edit.selectionStart, edit.selectionEnd)}]${next.slice(edit.selectionEnd)}`;
}

describe("toggleMarker", () => {
  it.each([
    ["**", "Very [Fancy] chair", "Very **[Fancy]** chair"],
    ["*", "Very [Fancy] chair", "Very *[Fancy]* chair"],
    ["`", "Run [ls -la] now", "Run `[ls -la]` now"],
  ] as const)("wraps the selection in %s", (marker, before, after) => {
    expect(press(before, marker)).toBe(after);
  });

  it.each([
    ["**", "a|b", "a**|**b"],
    ["*", "a|b", "a*|*b"],
    ["`", "a|b", "a`|`b"],
    ["**", "|", "**|**"],
  ] as const)(
    "inserts the %s pair at the caret, with the caret between",
    (marker, before, after) => {
      expect(press(before, marker)).toBe(after);
    },
  );

  it.each([
    ["**", "Very **[Fancy]** chair", "Very [Fancy] chair"],
    ["*", "Very *[Fancy]* chair", "Very [Fancy] chair"],
    ["`", "Run `[ls]` now", "Run [ls] now"],
  ] as const)(
    "unwraps %s just outside the selection",
    (marker, before, after) => {
      expect(press(before, marker)).toBe(after);
    },
  );

  it.each([
    ["**", "Very [**Fancy**] chair", "Very [Fancy] chair"],
    ["*", "Very [*Fancy*] chair", "Very [Fancy] chair"],
    ["`", "Run [`ls`] now", "Run [ls] now"],
  ] as const)(
    "unwraps %s just inside the selection",
    (marker, before, after) => {
      expect(press(before, marker)).toBe(after);
    },
  );

  it("takes an empty pair back out on a second press at the caret", () => {
    expect(press("a**|**b", "**")).toBe("a|b");
    expect(press("a*|*b", "*")).toBe("a|b");
    expect(press("a`|`b", "`")).toBe("a|b");
  });

  it("round-trips: pressing twice gives back the text and the selection", () => {
    for (const marker of ["**", "*", "`"] as const) {
      const once = press("Very [Fancy] chair", marker);
      if (!once) throw new Error("no edit");
      expect(press(once, marker)).toBe("Very [Fancy] chair");
    }
  });

  it("leaves bold's markers alone on ⌘I, and italic's on ⌘B", () => {
    expect(press("**[bold]**", "*")).toBe("***[bold]***");
    expect(press("[**bold**]", "*")).toBe("*[**bold**]*");
    expect(press("*[it]*", "**")).toBe("***[it]***");
    expect(press("[*it*]", "**")).toBe("**[*it*]**");
  });

  it("peels one marker off bold italic", () => {
    expect(press("***[both]***", "*")).toBe("**[both]**");
    expect(press("***[both]***", "**")).toBe("*[both]*");
  });

  it("doesn't take markers that only sit on one side", () => {
    expect(press("**[bold]", "**")).toBe("****[bold]**");
    expect(press("a**|", "**")).toBe("a****|**");
  });

  it("does nothing when wrapping would pass the limit", () => {
    expect(press("ab[c]", "**", 6)).toBe(null);
    expect(press("ab[c]", "*", 5)).toBe("ab*[c]*");
    expect(press("ab[c]", "`", 4)).toBe(null);
    expect(press("a|", "**", 4)).toBe(null);
    // Unwrapping only shortens, so it still works at the limit.
    expect(press("**[c]**", "**", 5)).toBe("[c]");
  });
});

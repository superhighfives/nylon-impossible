/**
 * How many words a todo's notes run to, for the "42 words" in a row's meta
 * line. A word is a run of non-whitespace characters, so markdown symbols and
 * URLs each count as written. Whitespace-only text is 0 words.
 *
 * The Apple app's `NoteLength.words` counts the same way: keep the two, and
 * their tests (`word-count.test.ts`, `TodoMetaTests`), in step.
 */
export function countWords(text: string | null | undefined): number {
  return text?.match(/\S+/g)?.length ?? 0;
}

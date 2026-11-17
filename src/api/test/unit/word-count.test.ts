import { countWords } from "@nylon-impossible/shared";
import { describe, expect, it } from "vitest";

// Mirrored in the Apple app's TodoMetaTests ("note word counts").
describe("countWords", () => {
  it.each([
    ["Spare", 1],
    ["Spare set is in the blue bowl", 7],
    ["  Spare set\n\n  is in the bowl \t", 6],
    ["**Bold** - [link](https://example.com/a b)", 4],
    ["one two　three", 3],
    ["", 0],
    ["  \n\t ", 0],
  ])("%j is %i words", (text, words) => {
    expect(countWords(text)).toBe(words);
  });

  it("counts nothing for missing notes", () => {
    expect(countWords(null)).toBe(0);
    expect(countWords(undefined)).toBe(0);
  });
});

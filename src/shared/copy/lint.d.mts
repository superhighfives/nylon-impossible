// Types for lint.mjs, so the copy lint test can import it from TypeScript.
export interface VocabularyTerm {
  term: string;
  use: string;
}

export interface Found {
  text: string;
  line: number;
}

export interface Problem {
  rule: "vocabulary" | "case";
  message: string;
}

export interface Finding extends Problem, Found {
  platform: "web" | "apple" | "gmail";
  file: string;
}

export const REPO_ROOT: string;
export const PRINCIPLES_PATH: string;
export const PROPER_NOUNS: string[];
export function parseVocabulary(markdown: string): VocabularyTerm[];
export function loadVocabulary(): VocabularyTerm[];
export function checkVocabulary(
  text: string,
  vocabulary: VocabularyTerm[],
): string[];
export function checkCase(text: string, properNouns?: string[]): string[];
export function checkString(
  text: string,
  vocabulary: VocabularyTerm[],
): Problem[];
export function extractJsx(source: string, fileName?: string): Found[];
export function extractGmail(source: string, fileName?: string): Found[];
export function extractSwift(source: string): Found[];
export function extractStringCatalog(source: string): Found[];
export function lintRepo(vocabulary?: VocabularyTerm[]): Finding[];

// Types for generate.mjs, so the token test can import it from TypeScript.
export interface Tokens {
  color: Record<
    string,
    { light: string; dark: string; source: string; usage: string }
  >;
  // biome-ignore lint/suspicious/noExplicitAny: the rest of the token tree is only read by the generator
  [key: string]: any;
}

export const REPO_ROOT: string;
export const TOKENS_PATH: string;
export const OUTPUTS: { css: string; swift: string };
export function loadTokens(): Tokens;
export function renderCss(tokens: Tokens): string;
export function renderSwift(tokens: Tokens): string;
export function renderAll(tokens?: Tokens): { css: string; swift: string };
export function staleOutputs(rendered?: { css: string; swift: string }): string[];

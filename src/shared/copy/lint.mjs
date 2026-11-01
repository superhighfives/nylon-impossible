#!/usr/bin/env node
/**
 * Checks user-facing strings against PRINCIPLES.md:
 *
 *   vocabulary  a word from the Vocabulary table's "Not" column ("task",
 *               "Completed", "This Week"), read from PRINCIPLES.md itself
 *   case        a capital after the first word that isn't a proper noun
 *               ("Keyboard Shortcuts")
 *
 * Strings come from the web app (JSX text, aria-label, title, placeholder),
 * the Apple apps (Text, Label, Button, .navigationTitle and friends, string
 * catalogs) and the Gmail add-on's cards.
 *
 *   node src/shared/copy/lint.mjs            report, always exit 0
 *   node src/shared/copy/lint.mjs --strict   exit 1 on web or Apple findings
 *
 * Gmail findings are reported but never fail, even with --strict. A line
 * containing `copy-lint-ignore`, or the line after one, is skipped.
 *
 * Plain Node plus the TypeScript parser. The check functions are exported so
 * the copy lint test can run them without touching the filesystem.
 */

import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(here, "../../..");
export const PRINCIPLES_PATH = join(REPO_ROOT, "PRINCIPLES.md");

/**
 * Words that keep their capitals mid-string. Multi-word entries match as a
 * phrase, so "This week" is fine and "This Week" isn't.
 */
export const PROPER_NOUNS = [
  // The product, its platforms and the services it talks to
  "Nylon",
  "Nylon Impossible",
  "Gmail",
  "Google",
  "Apple",
  "Mac",
  "App Store",
  "Clerk",
  "Sentry",
  "Archivo",
  "Dock",
  // Keys, as printed on the keyboard
  "Esc",
  "Return",
  "Enter",
  "Tab",
  "Shift",
  "Command",
  "Option",
  "Control",
  // The time lists and the fourth column, named as places
  "Today",
  "This week",
  "Someday",
  "Done",
  "Undo",
  // Calendar words
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Proper nouns that are plain words after a verb: Done is the place, but the
 * verb is "Mark done", not "Mark Done".
 */
const VERBS = { Done: "[Mm]ark" };

const IGNORE_MARKER = "copy-lint-ignore";

// ── Vocabulary ──────────────────────────────────────────────────────────────

/**
 * Reads the Vocabulary table's "Not" column out of PRINCIPLES.md, so the
 * table stays the only list. Returns [{ term, use }] where `use` is the
 * table's "Word" cell.
 */
export function parseVocabulary(markdown) {
  const section = markdown.split(/^## /m).find((s) => /^Vocabulary\b/.test(s));
  if (!section) throw new Error("PRINCIPLES.md has no ## Vocabulary section");
  const rows = section
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim()),
    );
  const [header, , ...body] = rows;
  const notCol = header?.indexOf("Not") ?? -1;
  const wordCol = header?.indexOf("Word") ?? -1;
  if (notCol < 0 || wordCol < 0) {
    throw new Error(
      "PRINCIPLES.md's Vocabulary table needs Word and Not columns",
    );
  }
  return body.flatMap((cells) =>
    cells[notCol]
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean)
      .map((term) => ({ term, use: cells[wordCol] })),
  );
}

export function loadVocabulary() {
  return parseVocabulary(readFileSync(PRINCIPLES_PATH, "utf8"));
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A term with a capital after its first letter ("This Week", "URLs") is
 * matched as written; anything else ignores case. A trailing "s" is allowed,
 * so "task" also catches "tasks".
 */
function vocabularyPattern(term) {
  const caseSensitive = /[A-Z]/.test(term.slice(1));
  const plural = term.endsWith("s") ? "" : "s?";
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(term)}${plural}(?![\\p{L}\\p{N}])`,
    caseSensitive ? "u" : "iu",
  );
}

export function checkVocabulary(text, vocabulary) {
  return vocabulary
    .filter(({ term }) => vocabularyPattern(term).test(text))
    .map(({ term, use }) => `"${term}": use ${use}`);
}

// ── Sentence case ───────────────────────────────────────────────────────────

const PLACEHOLDER = "⁠"; // stands in for interpolations and masked spans

/** Words after the first that are capitalised without being proper nouns. */
export function checkCase(text, properNouns = PROPER_NOUNS) {
  let masked = text
    // Quoted text is an example ("Try “Call Sam tomorrow”"), not a label
    .replace(/“[^”]*”|"[^"]*"|‘[^’]*’(?![\p{L}])/gu, PLACEHOLDER);
  const nouns = [...properNouns].sort((a, b) => b.length - a.length);
  for (const noun of nouns) {
    const verb = VERBS[noun] ? `(?<!\\b${VERBS[noun]}\\s)` : "";
    masked = masked.replace(
      new RegExp(
        `(?<![\\p{L}])${verb}${escapeRegExp(noun)}(?![\\p{L}])`,
        "gu",
      ),
      PLACEHOLDER,
    );
  }

  const offenders = [];
  let start = true;
  for (const match of masked.matchAll(/[\p{L}\p{N}][\p{L}\p{N}’'-]*|\S/gu)) {
    const word = match[0];
    // "·" separates phrases in hints: "Enter adds · Esc closes"
    if (/[.!?:…·\n]/.test(word)) {
      start = true;
      continue;
    }
    if (!/^[\p{L}\p{N}]/u.test(word)) {
      // Punctuation and placeholders: a placeholder takes the sentence's
      // first slot, so "{name} Options" still flags "Options".
      if (word === PLACEHOLDER) start = false;
      continue;
    }
    const isStart = start;
    start = false;
    if (isStart || !/^\p{Lu}/u.test(word)) continue;
    const letters = word.replace(/[’'-].*$/, "");
    if (letters.length === 1) continue; // "I", "I’ve", key names like "N"
    if (letters === letters.toUpperCase()) continue; // acronyms: API, URL
    if (/\p{Ll}\p{Lu}/u.test(letters)) continue; // brands: GitHub, TestFlight
    offenders.push(word);
  }
  return offenders;
}

export function checkString(text, vocabulary) {
  const problems = checkVocabulary(text, vocabulary).map((message) => ({
    rule: "vocabulary",
    message,
  }));
  const capitals = checkCase(text);
  if (capitals.length > 0) {
    problems.push({
      rule: "case",
      message: `sentence case: lowercase ${capitals.map((w) => `"${w}"`).join(", ")}`,
    });
  }
  return problems;
}

// ── Extraction ──────────────────────────────────────────────────────────────

/** [{ text, line }] with 1-based lines. Interpolations become PLACEHOLDER. */

const tidy = (s) =>
  s
    .replace(/<[^>]+>/g, " ") // Gmail card markup like <s>…</s>
    .replace(/\s+/g, " ")
    .trim();

const hasLetters = (s) => /\p{L}/u.test(s);

function templateText(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return (
      node.head.text +
      node.templateSpans.map((span) => PLACEHOLDER + span.literal.text).join("")
    );
  }
  return null;
}

const WEB_ATTRIBUTES = new Set(["aria-label", "title", "placeholder"]);

export function extractJsx(source, fileName = "file.tsx") {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found = [];
  const add = (node, text) => {
    const clean = tidy(text);
    if (!hasLetters(clean)) return;
    const pos = node.getStart(sf) + (text.length - text.trimStart().length);
    found.push({
      text: clean,
      line: sf.getLineAndCharacterOfPosition(pos).line + 1,
    });
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      add(node, node.text);
    } else if (
      ts.isJsxAttribute(node) &&
      WEB_ATTRIBUTES.has(node.name.getText(sf)) &&
      node.initializer
    ) {
      const init = ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      const text = init && templateText(init);
      if (text != null) add(init, text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/** Card fields the Gmail add-on shows: header, text, labels, toasts. */
const GMAIL_KEYS = new Set([
  "title",
  "subtitle",
  "header",
  "text",
  "label",
  "topLabel",
  "bottomLabel",
  "hintText",
  "notification",
  "empty",
]);

export function extractGmail(source, fileName = "file.ts") {
  const sf = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const found = [];
  const collect = (node) => {
    const text = templateText(node);
    if (text != null) {
      const clean = tidy(text);
      if (hasLetters(clean)) {
        const line =
          sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        found.push({ text: clean, line });
      }
      return;
    }
    // Nested objects get their own visit; functions aren't the field's value
    if (ts.isObjectLiteralExpression(node) || ts.isFunctionLike(node)) return;
    ts.forEachChild(node, collect);
  };
  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      GMAIL_KEYS.has(node.name.getText(sf))
    ) {
      collect(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

const SWIFT_CALLS = [
  "Text",
  "Label",
  "Button",
  "Section",
  "Toggle",
  "Menu",
  "Picker",
  "LabeledContent",
  "TextField",
  "SecureField",
  "navigationTitle",
  "accessibilityLabel",
  "accessibilityHint",
  "help",
  "alert",
  "confirmationDialog",
];
const SWIFT_CALL = new RegExp(
  `(?<![\\w.])\\.?(?:${SWIFT_CALLS.join("|")})\\(\\s*"`,
  "g",
);

/**
 * Reads a Swift string literal starting just after its opening quote.
 * Interpolations (which can hold quotes of their own) become PLACEHOLDER.
 */
function readSwiftString(source, from) {
  let text = "";
  let i = from;
  while (i < source.length) {
    const c = source[i];
    if (c === '"' || c === "\n") return { text, end: i };
    if (c === "\\" && source[i + 1] === "(") {
      let depth = 1;
      i += 2;
      while (i < source.length && depth > 0) {
        if (source[i] === '"') i = readSwiftString(source, i + 1).end;
        else if (source[i] === "(") depth++;
        else if (source[i] === ")") depth--;
        i++;
      }
      text += PLACEHOLDER;
      continue;
    }
    if (c === "\\") {
      text += source[i + 1] === "n" ? "\n" : source[i + 1];
      i += 2;
      continue;
    }
    text += c;
    i++;
  }
  return { text, end: i };
}

export function extractSwift(source) {
  const found = [];
  for (const match of source.matchAll(SWIFT_CALL)) {
    const from = match.index + match[0].length;
    const { text } = readSwiftString(source, from);
    const clean = tidy(text);
    if (!hasLetters(clean)) continue;
    const line = source.slice(0, from).split("\n").length;
    found.push({ text: clean, line });
  }
  return found;
}

/** A string catalog's keys are its source-language strings. */
export function extractStringCatalog(source) {
  const catalog = JSON.parse(source);
  const lines = source.split("\n");
  return Object.keys(catalog.strings ?? {})
    .filter(hasLetters)
    .map((key) => {
      const quoted = JSON.stringify(key);
      const line = lines.findIndex(
        (l) => l.includes(`${quoted} :`) || l.includes(`${quoted}:`),
      );
      return {
        text: tidy(key.replace(/%(\d+\$)?[@dlfs]+/g, PLACEHOLDER)),
        line: line + 1,
      };
    });
}

// ── Files ───────────────────────────────────────────────────────────────────

function walk(dir, keep, skipDir = () => false) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || skipDir(entry.name)) continue;
      out.push(...walk(path, keep, skipDir));
    } else if (keep(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

const IOS_ROOT = join(REPO_ROOT, "src/ios");

export const SOURCES = [
  {
    platform: "web",
    files: () =>
      walk(
        join(REPO_ROOT, "src/web/src"),
        (name) => name.endsWith(".tsx") && !name.includes(".test."),
        (name) => name === "__tests__" || name === "test",
      ),
    extract: extractJsx,
  },
  {
    platform: "apple",
    files: () =>
      walk(
        IOS_ROOT,
        (name) => name.endsWith(".swift"),
        (name) => /Tests$/.test(name) || name === "fastlane",
      ),
    extract: extractSwift,
  },
  {
    platform: "apple",
    files: () => walk(IOS_ROOT, (name) => extname(name) === ".xcstrings"),
    extract: extractStringCatalog,
  },
  {
    platform: "gmail",
    files: () => [
      join(REPO_ROOT, "src/api/src/lib/addon-cards.ts"),
      ...walk(join(REPO_ROOT, "src/api/src/handlers/gmail-addon"), (name) =>
        name.endsWith(".ts"),
      ),
    ],
    extract: extractGmail,
  },
];

function ignored(lines, line) {
  return (
    lines[line - 1]?.includes(IGNORE_MARKER) ||
    lines[line - 2]?.includes(IGNORE_MARKER)
  );
}

/** Every finding in the repo: [{ platform, file, line, text, rule, message }]. */
export function lintRepo(vocabulary = loadVocabulary()) {
  const findings = [];
  for (const { platform, files, extract } of SOURCES) {
    for (const path of files()) {
      const source = readFileSync(path, "utf8");
      const lines = source.split("\n");
      const file = relative(REPO_ROOT, path);
      for (const { text, line } of extract(source, path)) {
        if (ignored(lines, line)) continue;
        for (const problem of checkString(text, vocabulary)) {
          findings.push({ platform, file, line, text, ...problem });
        }
      }
    }
  }
  return findings;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const display = (text) => text.replaceAll(PLACEHOLDER, "{…}");

function report(findings, strict) {
  const github = process.env.GITHUB_ACTIONS === "true";
  for (const f of findings) {
    const message = `${f.message} in "${display(f.text)}"`;
    console.log(`${f.file}:${f.line}: [${f.platform}/${f.rule}] ${message}`);
    if (github) {
      const level = strict && f.platform !== "gmail" ? "error" : "warning";
      const file = f.file.replace(/,/g, "%2C");
      const body = message.replace(/%/g, "%25").replace(/\n/g, "%0A");
      console.log(
        `::${level} file=${file},line=${f.line},title=Copy (${f.rule})::${body}`,
      );
    }
  }

  const counts = ["web", "apple", "gmail"]
    .map((p) => `${p} ${findings.filter((f) => f.platform === p).length}`)
    .join(", ");
  console.log(
    findings.length === 0
      ? "Copy lint: no findings."
      : `Copy lint: ${findings.length} finding(s) (${counts}).`,
  );

  if (github && process.env.GITHUB_STEP_SUMMARY && findings.length > 0) {
    const cell = (s) => s.replace(/\|/g, "\\|");
    const rows = findings.map(
      (f) =>
        `| \`${cell(f.file)}:${f.line}\` | ${f.platform} | ${cell(display(f.text))} | ${cell(f.message)} |`,
    );
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        "## Copy lint",
        "",
        `${findings.length} finding(s): ${counts}. Checked against PRINCIPLES.md's Vocabulary table and sentence case.`,
        "",
        "| Where | Platform | String | Problem |",
        "| --- | --- | --- | --- |",
        ...rows,
        "",
      ].join("\n"),
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const strict = process.argv.includes("--strict");
  const findings = lintRepo();
  report(findings, strict);
  if (strict && findings.some((f) => f.platform !== "gmail")) process.exit(1);
}

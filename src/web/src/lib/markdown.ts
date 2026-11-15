/**
 * The Markdown that notes render: paragraphs, `-`/`*`/`1.` lists (nested one
 * level), **bold**, *italic*, `inline code`, fenced code, links and bare
 * URLs, `#`–`###` headings and `>` quotes. Every newline is a line break, as
 * in a GitHub comment, so notes written as plain text keep their look.
 *
 * It parses to a tree, never to HTML: whatever isn't in that list (raw
 * HTML, images, tables, `- [ ]` boxes, `####`) stays the text that was
 * typed, and only `http(s):` and `mailto:` links are live. The stored
 * string is never changed.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "br" }
  | { type: "code"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export interface ListItem {
  children: Inline[];
  /** A blank line came before it, so it keeps that gap. */
  gap: boolean;
  list?: List;
}

export interface List {
  type: "list";
  ordered: boolean;
  start: number;
  items: ListItem[];
}

export type Block = (
  | { type: "paragraph"; children: Inline[] }
  | { type: "heading"; level: 1 | 2 | 3; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "quote"; blocks: Block[] }
  | List
) & {
  /** A blank line came before it, so it keeps that gap. */
  gap?: boolean;
};

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,3})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const ITEM = /^( *)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
/** How deep quotes nest before the rest reads as text. */
const MAX_QUOTE_DEPTH = 3;
/** How deep bold, italic and links nest before the rest reads as text. */
const MAX_INLINE_DEPTH = 8;

const expandTabs = (line: string) => line.replace(/\t/g, "    ");
const isBlank = (line: string) => line.trim() === "";

/** Notes as blocks. */
export function parseMarkdown(source: string): Block[] {
  return parseBlocks(source.replace(/\r\n?/g, "\n").split("\n"), 0);
}

function parseBlocks(lines: string[], depth: number): Block[] {
  const blocks: Block[] = [];
  let blank = false;
  let i = 0;
  const push = (block: Block) => {
    if (blank && blocks.length > 0) block.gap = true;
    blank = false;
    blocks.push(block);
  };
  const startsBlock = (line: string) =>
    FENCE.test(line) ||
    HEADING.test(line) ||
    ITEM.test(expandTabs(line)) ||
    (depth < MAX_QUOTE_DEPTH && QUOTE.test(line));

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      blank = true;
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1];
      const close = new RegExp(
        `^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`,
      );
      const body: string[] = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      i++; // the closing fence, or past the end when there isn't one
      push({ type: "code", text: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        children: parseInline(heading[2] ?? ""),
      });
      i++;
      continue;
    }

    if (depth < MAX_QUOTE_DEPTH && QUOTE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const quoted = QUOTE.exec(lines[i]);
        if (!quoted) break;
        inner.push(quoted[1]);
        i++;
      }
      push({ type: "quote", blocks: parseBlocks(inner, depth + 1) });
      continue;
    }

    if (ITEM.test(expandTabs(line))) {
      i = parseList(lines, i, push);
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && !isBlank(lines[i])) {
      if (paragraph.length > 0 && startsBlock(lines[i])) break;
      paragraph.push(lines[i].trim());
      i++;
    }
    push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
  }
  return blocks;
}

/**
 * One list from `lines[start]`: items indented two or more spaces past the
 * first nest under the item before them (one level; deeper reads as that level), and an indented
 * line that isn't an item continues the item above it on a new line.
 * Returns the index of the first line after it.
 */
function parseList(
  lines: string[],
  start: number,
  push: (block: Block) => void,
): number {
  const first = ITEM.exec(expandTabs(lines[start]));
  const ordered = !!first && /\d/.test(first[2]);
  const base = first?.[1].length ?? 0;
  const list: List = {
    type: "list",
    ordered,
    start: ordered && first ? Number.parseInt(first[2], 10) : 1,
    items: [],
  };
  // The text of the last item, so a continuation line can join it.
  let last: string[] | null = null;
  const texts = new Map<ListItem, string[]>();
  let blank = false;
  let i = start;

  for (; i < lines.length; i++) {
    const line = expandTabs(lines[i]);
    if (isBlank(line)) {
      blank = true;
      continue;
    }
    const item = ITEM.exec(line);
    const indent = (item ? item[1] : (/^ */.exec(line)?.[0] ?? "")).length;
    if (item) {
      const itemOrdered = /\d/.test(item[2]);
      const parent = list.items.at(-1);
      const entry: ListItem = { children: [], gap: blank };
      const text = [item[3]];
      texts.set(entry, text);
      if (indent >= base + 2 && parent) {
        parent.list ??= {
          type: "list",
          ordered: itemOrdered,
          start: itemOrdered ? Number.parseInt(item[2], 10) : 1,
          items: [],
        };
        parent.list.items.push(entry);
      } else {
        // A bullet after numbers, or numbers after bullets, starts a new list.
        if (itemOrdered !== ordered) break;
        list.items.push(entry);
      }
      last = text;
      blank = false;
      continue;
    }
    if (indent >= base + 2 && !blank && last) {
      last.push(line.trim());
      continue;
    }
    break;
  }

  // A blank line before whatever follows the list belongs to that, not to
  // the list's last item.
  while (i > start && isBlank(lines[i - 1])) i--;

  const fill = (items: ListItem[]) => {
    for (const entry of items) {
      entry.children = parseInline((texts.get(entry) ?? []).join("\n"));
      if (entry.list) fill(entry.list.items);
    }
  };
  fill(list.items);
  push(list);
  return i;
}

const PUNCTUATION = /[!-/:-@[-`{-~]/;
const WORD = /[\p{L}\p{N}]/u;
const BARE_URL = /^(?:https?:\/\/|www\.)[^\s<>]+/i;
const ANGLE_URL = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i;

/** A link that may be live: `http(s):` or `mailto:`, nothing else. */
export function safeHref(href: string): string | null {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** A bare URL's end, less the punctuation that closes its sentence. */
function trimUrl(url: string): string {
  let end = url.length;
  for (;;) {
    const ch = url[end - 1];
    if (/[.,:;!?'"*_~]/.test(ch)) {
      end--;
    } else if (ch === ")") {
      const opens = url.slice(0, end).split("(").length - 1;
      const closes = url.slice(0, end).split(")").length - 1;
      if (closes <= opens) break;
      end--;
    } else {
      break;
    }
  }
  return url.slice(0, end);
}

/**
 * `[text](href)` at `start` (on the `[`): the text, the href and where it
 * ends, or null when it isn't one.
 */
function matchLink(
  s: string,
  start: number,
): { text: string; href: string; end: number } | null {
  let depth = 0;
  let close = -1;
  for (let j = start; j < s.length; j++) {
    const ch = s[j];
    if (ch === "\\") {
      j++;
    } else if (ch === "[") {
      depth++;
    } else if (ch === "]") {
      depth--;
      if (depth === 0) {
        close = j;
        break;
      }
    }
  }
  if (close < 0 || s[close + 1] !== "(") return null;
  let j = close + 2;
  while (s[j] === " ") j++;
  let href = "";
  if (s[j] === "<") {
    const end = s.indexOf(">", j);
    if (end < 0) return null;
    href = s.slice(j + 1, end);
    j = end + 1;
  } else {
    let parens = 0;
    const from = j;
    for (; j < s.length; j++) {
      const ch = s[j];
      if (/\s/.test(ch)) break;
      if (ch === "(") parens++;
      if (ch === ")") {
        if (parens === 0) break;
        parens--;
      }
    }
    href = s.slice(from, j);
  }
  // An optional "title", which notes don't show.
  const title = /^\s+(?:"[^"]*"|'[^']*')/.exec(s.slice(j));
  if (title) j += title[0].length;
  while (s[j] === " ") j++;
  if (s[j] !== ")") return null;
  return { text: s.slice(start + 1, close), href, end: j + 1 };
}

/**
 * Where the `*` or `_` run of `marker` that opens at `from` closes, or -1.
 * Runs of the other length are stepped over, so `*a **b** c*` pairs its
 * outer stars.
 */
function findCloser(s: string, from: number, marker: string): number {
  const ch = marker[0];
  for (let j = from; j < s.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s[j] === "`") {
      // Skip a code span; its stars aren't markup.
      const run = /^`+/.exec(s.slice(j))?.[0] ?? "`";
      const end = s.indexOf(run, j + run.length);
      if (end > 0) j = end + run.length - 1;
      continue;
    }
    if (s[j] !== ch) continue;
    let run = 1;
    while (s[j + run] === ch) run++;
    const before = s[j - 1];
    const after = s[j + run];
    const closes =
      j > from &&
      before !== undefined &&
      !/\s/.test(before) &&
      !(ch === "_" && after !== undefined && WORD.test(after));
    if (closes) {
      // `**` closes on a run's last two; `*` on a single, or a triple's last.
      if (marker.length === 2 && run >= 2) return j + run - 2;
      if (marker.length === 1 && run !== 2) return j + run - 1;
    }
    j += run - 1;
  }
  return -1;
}

/** One paragraph's, item's or heading's text, `\n` as line breaks. */
export function parseInline(s: string, depth = 0, inLink = false): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ type: "text", text });
    text = "";
  };
  const emit = (node: Inline) => {
    flush();
    out.push(node);
  };
  if (depth > MAX_INLINE_DEPTH) return [{ type: "text", text: s }];

  let i = 0;
  while (i < s.length) {
    const ch = s[i];

    if (ch === "\\" && i + 1 < s.length && PUNCTUATION.test(s[i + 1])) {
      text += s[i + 1];
      i += 2;
      continue;
    }

    if (ch === "\n") {
      emit({ type: "br" });
      i++;
      continue;
    }

    if (ch === "`") {
      const run = /^`+/.exec(s.slice(i))?.[0] ?? "`";
      const end = s.indexOf(run, i + run.length);
      if (end < 0 || s[end + run.length] === "`") {
        text += run;
        i += run.length;
        continue;
      }
      let code = s.slice(i + run.length, end).replace(/\n/g, " ");
      if (/^ .*[^ ].* $/.test(code)) code = code.slice(1, -1);
      emit({ type: "code", text: code });
      i = end + run.length;
      continue;
    }

    // Images aren't drawn: `![alt](src)` stays as typed.
    if (ch === "!" && s[i + 1] === "[") {
      const image = matchLink(s, i + 1);
      if (image) {
        text += s.slice(i, image.end);
        i = image.end;
        continue;
      }
    }

    if (ch === "[" && !inLink) {
      const link = matchLink(s, i);
      if (link) {
        const href = safeHref(link.href);
        if (href) {
          emit({
            type: "link",
            href,
            children: parseInline(link.text, depth + 1, true),
          });
        } else {
          text += s.slice(i, link.end);
        }
        i = link.end;
        continue;
      }
    }

    if (ch === "<" && !inLink) {
      const angle = ANGLE_URL.exec(s.slice(i));
      const href = angle && safeHref(angle[1]);
      if (angle && href) {
        emit({
          type: "link",
          href,
          children: [{ type: "text", text: angle[1] }],
        });
        i += angle[0].length;
        continue;
      }
    }

    if (
      (ch === "h" || ch === "H" || ch === "w" || ch === "W") &&
      !inLink &&
      (i === 0 || !WORD.test(s[i - 1]))
    ) {
      const bare = BARE_URL.exec(s.slice(i));
      if (bare) {
        const url = trimUrl(bare[0]);
        const href = safeHref(/^www\./i.test(url) ? `https://${url}` : url);
        if (href && url.length > 4) {
          emit({ type: "link", href, children: [{ type: "text", text: url }] });
          i += url.length;
          continue;
        }
      }
    }

    if (ch === "*" || ch === "_") {
      let run = 1;
      while (s[i + run] === ch) run++;
      const next = s[i + run];
      const opens =
        next !== undefined &&
        !/\s/.test(next) &&
        !(ch === "_" && i > 0 && WORD.test(s[i - 1]));
      if (opens) {
        const marker = run >= 2 ? ch + ch : ch;
        const close = findCloser(s, i + marker.length, marker);
        if (close > 0) {
          const children = parseInline(
            s.slice(i + marker.length, close),
            depth + 1,
            inLink,
          );
          emit({ type: marker.length === 2 ? "strong" : "em", children });
          i = close + marker.length;
          continue;
        }
      }
      text += s.slice(i, i + run);
      i += run;
      continue;
    }

    text += ch;
    i++;
  }
  flush();
  return out;
}

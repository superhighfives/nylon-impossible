import { z } from "zod/v4";

/** Images are committed as-is, so this caps what lands in the inbox repo. */
export const MAX_FEEDBACK_IMAGES = 4;
/**
 * Label that sets the feedback workflow on an issue. Filed with it only when
 * the reporter is an admin; on anyone else's, the repo owner adds it by hand.
 */
export const AUTO_FIX_LABEL = "auto-fix";
/** Orphan branch screenshots are committed to; created once, by hand. */
export const FEEDBACK_ASSETS_BRANCH = "feedback-assets";
export const MAX_FEEDBACK_IMAGE_BYTES = 5 * 1024 * 1024;
// Base64 is 4 chars per 3 bytes; the string check runs before decoding.
const MAX_BASE64_LENGTH = Math.ceil(MAX_FEEDBACK_IMAGE_BYTES / 3) * 4;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const IMAGE_TYPES = {
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
} as const;

const PLATFORM_NAMES = {
  ios: "iOS",
  ipados: "iPadOS",
  mac: "Mac",
  web: "Web",
} as const;

export type FeedbackPlatform = keyof typeof PLATFORM_NAMES;

const contextValue = z.string().max(200).optional();

const imageSchema = z
  .object({
    contentType: z.enum(["image/png", "image/jpeg"]),
    data: z
      .string()
      .min(1)
      .max(MAX_BASE64_LENGTH, "Each image must be 5 MB or smaller")
      .regex(BASE64, "Image data must be base64")
      // GitHub rejects unpadded base64, which would otherwise surface as a 502.
      .refine((data) => data.length % 4 === 0, "Image data must be base64"),
  })
  .refine((image) => matchesMagic(image.data, image.contentType), {
    message: "Image data doesn't match its content type",
  });

export const feedbackSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(5000),
  images: z.array(imageSchema).max(MAX_FEEDBACK_IMAGES).default([]),
  context: z.object({
    platform: z.enum(["ios", "ipados", "mac", "web"]),
    appVersion: contextValue,
    build: contextValue,
    commit: contextValue,
    os: contextValue,
    device: contextValue,
    screen: contextValue,
    colorScheme: z.enum(["light", "dark"]).optional(),
    viewport: contextValue,
    locale: contextValue,
    timezone: contextValue,
  }),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

function matchesMagic(
  data: string,
  contentType: keyof typeof IMAGE_TYPES,
): boolean {
  let head: string;
  try {
    head = atob(data.slice(0, 8));
  } catch {
    return false;
  }
  return IMAGE_TYPES[contentType].magic.every(
    (byte, i) => head.charCodeAt(i) === byte,
  );
}

/** `[iOS] ` + the description's first line, cut to 80 characters. */
export function feedbackTitle(input: FeedbackInput): string {
  const firstLine = input.description.split("\n")[0].trim();
  const cut =
    firstLine.length > 80 ? `${firstLine.slice(0, 79).trimEnd()}…` : firstLine;
  return `[${PLATFORM_NAMES[input.context.platform]}] ${cut}`;
}

const CONTEXT_ROWS: [keyof FeedbackInput["context"], string][] = [
  ["platform", "Platform"],
  ["appVersion", "Version"],
  ["build", "Build"],
  ["commit", "Commit"],
  ["os", "OS"],
  ["device", "Device"],
  ["screen", "Screen"],
  ["colorScheme", "Appearance"],
  ["viewport", "Viewport"],
  ["locale", "Locale"],
  ["timezone", "Time zone"],
];

function tableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

export function feedbackBody(
  input: FeedbackInput,
  imageUrls: string[],
  userId: string,
): string {
  const rows = CONTEXT_ROWS.flatMap(([key, label]) => {
    const value = input.context[key];
    return value ? [`| ${label} | ${tableCell(value)} |`] : [];
  });
  rows.push(`| Reporter | \`${userId}\` |`);

  const screenshots = imageUrls.map(
    (url, i) => `![Screenshot ${i + 1}](${url})`,
  );

  return [
    input.description,
    ...(screenshots.length > 0 ? ["", ...screenshots] : []),
    "",
    "<details><summary>Context</summary>",
    "",
    "| | |",
    "| --- | --- |",
    ...rows,
    "",
    "</details>",
  ].join("\n");
}

export class GitHubFeedbackError extends Error {
  constructor(
    readonly step: "upload" | "issue",
    readonly status: number,
    detail: string,
  ) {
    super(`GitHub ${step} failed (${status}): ${detail}`);
    this.name = "GitHubFeedbackError";
  }
}

export interface FiledFeedback {
  issueNumber: number;
  issueUrl: string;
}

/**
 * Commit each screenshot to the assets branch, then open the issue that
 * embeds them. The branch is an orphan that's never merged, so screenshots
 * stay out of `main`'s history, and no workflow runs on a push to it. Uploads
 * run one at a time: parallel commits to the same branch race and 409.
 */
export async function fileFeedback(
  input: FeedbackInput,
  opts: {
    repo: string;
    token: string;
    userId: string;
    /** Add AUTO_FIX_LABEL so the feedback workflow picks the issue up. */
    autoFix: boolean;
    now?: Date;
    id?: () => string;
    fetch?: typeof fetch;
  },
): Promise<FiledFeedback> {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? new Date();
  const newId = opts.id ?? (() => crypto.randomUUID());
  const headers = {
    Authorization: `Bearer ${opts.token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "nylon-impossible-api",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const api = `https://api.github.com/repos/${opts.repo}`;
  const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  const imageUrls: string[] = [];
  for (const image of input.images) {
    const path = `screenshots/${month}/${newId()}.${IMAGE_TYPES[image.contentType].ext}`;
    const res = await doFetch(`${api}/contents/${path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `Add feedback screenshot (${input.context.platform})`,
        content: image.data,
        branch: FEEDBACK_ASSETS_BRANCH,
      }),
    });
    if (!res.ok) {
      throw new GitHubFeedbackError("upload", res.status, await res.text());
    }
    imageUrls.push(
      `https://github.com/${opts.repo}/blob/${FEEDBACK_ASSETS_BRANCH}/${path}?raw=true`,
    );
  }

  const res = await doFetch(`${api}/issues`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: feedbackTitle(input),
      body: feedbackBody(input, imageUrls, opts.userId),
      labels: [
        "feedback",
        `platform:${input.context.platform}`,
        ...(opts.autoFix ? [AUTO_FIX_LABEL] : []),
      ],
    }),
  });
  if (!res.ok) {
    throw new GitHubFeedbackError("issue", res.status, await res.text());
  }
  const issue = await res.json<{ number: number; html_url: string }>();
  return { issueNumber: issue.number, issueUrl: issue.html_url };
}

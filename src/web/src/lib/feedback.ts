/**
 * Feedback from the web app to a public GitHub issue (`POST /feedback`). Images
 * are prepared here — downscaled and base64-encoded — so the dialog only
 * deals in previews. See https://github.com/superhighfives/nylon-impossible/blob/02f8c45b3ba52896a25bde813cfd2b0a05ef9fb1/plans/done/2026-10-21-feedback-inbox.md.
 */

export const MAX_IMAGES = 4;
/** The API's per-image cap, decoded. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Long edge a screenshot is scaled down to; plenty for a bug report. */
export const MAX_IMAGE_EDGE = 2400;
export const MAX_DESCRIPTION = 5000;
/** The API caps each context value at this many characters. */
const MAX_CONTEXT = 200;

export type FeedbackImageType = "image/png" | "image/jpeg";

export interface FeedbackImage {
  contentType: FeedbackImageType;
  /** Base64, no `data:` prefix. */
  data: string;
}

export interface FeedbackContext {
  platform: "web";
  commit?: string;
  os?: string;
  screen?: string;
  colorScheme?: "light" | "dark";
  viewport?: string;
  locale?: string;
  timezone?: string;
}

export interface FeedbackRequest {
  description: string;
  images: FeedbackImage[];
  context: FeedbackContext;
}

export interface FeedbackResponse {
  issueNumber: number;
  issueUrl: string;
}

/** Scale `width`×`height` down so neither side exceeds `max`. Never up. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const scale = max / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Keep PNG (crisp text) when it fits under the cap; otherwise JPEG. */
export function pickEncoding(pngBytes: number): FeedbackImageType {
  return pngBytes <= MAX_IMAGE_BYTES ? "image/png" : "image/jpeg";
}

/** Whether a file can be sent as-is: right type, size and dimensions. */
export function canSendAsIs(
  file: { type: string; size: number },
  width: number,
  height: number,
): file is { type: FeedbackImageType; size: number } {
  return (
    (file.type === "image/png" || file.type === "image/jpeg") &&
    file.size <= MAX_IMAGE_BYTES &&
    Math.max(width, height) <= MAX_IMAGE_EDGE
  );
}

/** The image files among a paste or drop, in order. */
export function imageFiles(items: Iterable<File> | ArrayLike<File>): File[] {
  return Array.from(items).filter((f) => f.type.startsWith("image/"));
}

async function toBase64(blob: Blob): Promise<string> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(",") + 1);
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: FeedbackImageType,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Couldn't encode image")),
      type,
      quality,
    ),
  );
}

/**
 * Ready an image to send: as-is when it already fits, otherwise redrawn at
 * most `MAX_IMAGE_EDGE` on its long side, as PNG if that fits under the cap
 * and JPEG (0.85) if not.
 */
export async function prepareImage(file: Blob): Promise<FeedbackImage> {
  const bitmap = await createImageBitmap(file);
  try {
    if (canSendAsIs(file, bitmap.width, bitmap.height)) {
      return { contentType: file.type, data: await toBase64(file) };
    }
    const size = fitWithin(bitmap.width, bitmap.height, MAX_IMAGE_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, size.width, size.height);
    const png = await canvasBlob(canvas, "image/png");
    const contentType = pickEncoding(png.size);
    const blob =
      contentType === "image/png"
        ? png
        : await canvasBlob(canvas, "image/jpeg", 0.85);
    return { contentType, data: await toBase64(blob) };
  } finally {
    bitmap.close();
  }
}

const clip = (value: string | undefined) =>
  value ? value.slice(0, MAX_CONTEXT) : undefined;

/** What the browser knows about where the feedback came from. */
export function feedbackContext(): FeedbackContext {
  const context: FeedbackContext = {
    platform: "web",
    commit: clip(import.meta.env.VITE_COMMIT_SHA),
    os: clip(navigator.userAgent),
    screen: clip(window.location.pathname),
    colorScheme: document.documentElement.classList.contains("dark")
      ? "dark"
      : "light",
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    locale: clip(navigator.language),
    timezone: clip(Intl.DateTimeFormat().resolvedOptions().timeZone),
  };
  for (const key of Object.keys(context) as (keyof FeedbackContext)[]) {
    if (context[key] === undefined) delete context[key];
  }
  return context;
}

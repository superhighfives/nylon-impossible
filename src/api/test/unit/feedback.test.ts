import { describe, expect, it, vi } from "vitest";
import {
  type FeedbackInput,
  feedbackBody,
  feedbackSchema,
  feedbackTitle,
  fileFeedback,
  GitHubFeedbackError,
} from "../../src/lib/feedback";

// Real file signatures, base64-encoded, padded with a few bytes.
const PNG = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
const JPEG = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10));

function input(overrides: Partial<FeedbackInput> = {}): FeedbackInput {
  return feedbackSchema.parse({
    description: "Tick jumps on done rows\nHappens in dark mode only.",
    context: { platform: "ios", appVersion: "1.4.0", screen: "today" },
    ...overrides,
  });
}

describe("feedbackSchema", () => {
  it("accepts a PNG and a JPEG whose bytes match their type", () => {
    const result = feedbackSchema.safeParse({
      description: "x",
      images: [
        { contentType: "image/png", data: PNG },
        { contentType: "image/jpeg", data: JPEG },
      ],
      context: { platform: "web" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects image data that doesn't match its content type", () => {
    const result = feedbackSchema.safeParse({
      description: "x",
      images: [{ contentType: "image/png", data: JPEG }],
      context: { platform: "web" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a blank description, more than four images, and unknown platforms", () => {
    const image = { contentType: "image/png", data: PNG };
    for (const body of [
      { description: "   ", context: { platform: "web" } },
      {
        description: "x",
        images: [image, image, image, image, image],
        context: { platform: "web" },
      },
      { description: "x", context: { platform: "android" } },
    ]) {
      expect(feedbackSchema.safeParse(body).success).toBe(false);
    }
  });

  it("rejects an image over 5 MB before decoding it", () => {
    const result = feedbackSchema.safeParse({
      description: "x",
      images: [{ contentType: "image/png", data: PNG + "A".repeat(7_000_000) }],
      context: { platform: "web" },
    });
    expect(result.success).toBe(false);
  });
});

describe("feedbackTitle", () => {
  it("prefixes the platform and uses the first line", () => {
    expect(feedbackTitle(input())).toBe("[iOS] Tick jumps on done rows");
  });

  it("cuts a long first line to 80 characters", () => {
    const title = feedbackTitle(input({ description: "a".repeat(200) }));
    expect(title).toBe(`[iOS] ${"a".repeat(79)}…`);
  });
});

describe("feedbackBody", () => {
  it("embeds screenshots and lists only the context that was sent", () => {
    const body = feedbackBody(
      input({
        context: { platform: "mac", screen: "a|b", os: "macOS 26" },
      }),
      ["https://github.com/o/r/blob/main/s.png?raw=true"],
      "user_1",
    );
    expect(body).toContain(
      "![Screenshot 1](https://github.com/o/r/blob/main/s.png?raw=true)",
    );
    expect(body).toContain("| Screen | a\\|b |");
    expect(body).toContain("| OS | macOS 26 |");
    expect(body).toContain("| Reporter | `user_1` |");
    expect(body).not.toContain("| Viewport |");
  });
});

describe("fileFeedback", () => {
  const opts = {
    repo: "o/r",
    token: "t",
    userId: "user_1",
    now: new Date("2026-10-21T12:00:00Z"),
    id: () => "abc",
  };

  it("commits each image, then opens a labelled issue that embeds it", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 201 }))
      .mockResolvedValueOnce(
        Response.json(
          { number: 7, html_url: "https://github.com/o/r/issues/7" },
          { status: 201 },
        ),
      );

    const filed = await fileFeedback(
      input({ images: [{ contentType: "image/png", data: PNG }] }),
      { ...opts, fetch },
    );

    expect(filed).toEqual({
      issueNumber: 7,
      issueUrl: "https://github.com/o/r/issues/7",
    });
    const [uploadUrl, upload] = fetch.mock.calls[0];
    expect(uploadUrl).toBe(
      "https://api.github.com/repos/o/r/contents/screenshots/2026/10/abc.png",
    );
    expect(upload.method).toBe("PUT");
    expect(upload.headers.Authorization).toBe("Bearer t");
    expect(JSON.parse(upload.body).content).toBe(PNG);

    const [issueUrl, issue] = fetch.mock.calls[1];
    expect(issueUrl).toBe("https://api.github.com/repos/o/r/issues");
    const payload = JSON.parse(issue.body);
    expect(payload.labels).toEqual(["feedback", "platform:ios"]);
    expect(payload.body).toContain(
      "https://github.com/o/r/blob/main/screenshots/2026/10/abc.png?raw=true",
    );
  });

  it("stops before opening an issue when an upload fails", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 403 }));
    await expect(
      fileFeedback(input({ images: [{ contentType: "image/png", data: PNG }] }), {
        ...opts,
        fetch,
      }),
    ).rejects.toBeInstanceOf(GitHubFeedbackError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

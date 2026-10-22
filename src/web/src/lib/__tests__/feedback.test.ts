import { describe, expect, it } from "vitest";
import {
  canSendAsIs,
  feedbackContext,
  fitWithin,
  imageFiles,
  MAX_IMAGE_BYTES,
  pickEncoding,
} from "../feedback";

describe("fitWithin", () => {
  it("leaves an image that already fits alone", () => {
    expect(fitWithin(1440, 900, 2400)).toEqual({ width: 1440, height: 900 });
  });

  it("scales the long edge down to the cap, keeping the ratio", () => {
    expect(fitWithin(1290, 2796, 2400)).toEqual({ width: 1107, height: 2400 });
    expect(fitWithin(4800, 3000, 2400)).toEqual({ width: 2400, height: 1500 });
  });
});

describe("pickEncoding", () => {
  it("keeps PNG under the cap and falls back to JPEG over it", () => {
    expect(pickEncoding(MAX_IMAGE_BYTES)).toBe("image/png");
    expect(pickEncoding(MAX_IMAGE_BYTES + 1)).toBe("image/jpeg");
  });
});

describe("canSendAsIs", () => {
  it("needs a PNG or JPEG under the size and edge caps", () => {
    expect(canSendAsIs({ type: "image/png", size: 1000 }, 1440, 900)).toBe(
      true,
    );
    expect(canSendAsIs({ type: "image/webp", size: 1000 }, 1440, 900)).toBe(
      false,
    );
    expect(
      canSendAsIs({ type: "image/png", size: MAX_IMAGE_BYTES + 1 }, 10, 10),
    ).toBe(false);
    expect(canSendAsIs({ type: "image/jpeg", size: 1000 }, 3000, 900)).toBe(
      false,
    );
  });
});

describe("imageFiles", () => {
  it("keeps only images, in order", () => {
    const a = new File(["a"], "a.png", { type: "image/png" });
    const b = new File(["b"], "b.txt", { type: "text/plain" });
    const c = new File(["c"], "c.jpg", { type: "image/jpeg" });
    expect(imageFiles([a, b, c])).toEqual([a, c]);
  });
});

describe("feedbackContext", () => {
  it("reports the page, theme and window without empty fields", () => {
    document.documentElement.classList.add("dark");
    window.history.pushState({}, "", "/this-week");
    const context = feedbackContext();
    expect(context).toMatchObject({
      platform: "web",
      screen: "/this-week",
      colorScheme: "dark",
      viewport: `${window.innerWidth}×${window.innerHeight}`,
    });
    expect(context.os?.length).toBeLessThanOrEqual(200);
    expect(Object.values(context)).not.toContain(undefined);
    document.documentElement.classList.remove("dark");
  });
});

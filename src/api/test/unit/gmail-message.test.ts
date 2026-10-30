import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMessageMetadata, senderName } from "../../src/lib/gmail-message";

describe("senderName", () => {
  it("takes the name, or the address when there isn't one", () => {
    expect(senderName("Sam Lee <sam@example.com>")).toBe("Sam Lee");
    expect(senderName('"Lee, Sam" <sam@example.com>')).toBe("Lee, Sam");
    expect(senderName("<sam@example.com>")).toBe("sam@example.com");
    expect(senderName("sam@example.com")).toBe("sam@example.com");
  });
});

describe("fetchMessageMetadata", () => {
  afterEach(() => vi.unstubAllGlobals());
  const input = {
    messageId: "m 1",
    messageToken: "msg-t",
    userToken: "user-t",
  };

  it("reads the headers with both tokens, never the body", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        internalDate: String(Date.UTC(2026, 9, 28, 17)),
        payload: {
          headers: [
            { name: "Subject", value: " Q3 planning notes " },
            { name: "From", value: "Sam Lee <sam@example.com>" },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const metadata = await fetchMessageMetadata(input);
    expect(metadata).toEqual({
      subject: "Q3 planning notes",
      from: "Sam Lee",
      date: new Date(Date.UTC(2026, 9, 28, 17)),
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(url.pathname).toBe("/gmail/v1/users/me/messages/m%201");
    expect(url.searchParams.get("format")).toBe("metadata");
    expect(url.searchParams.getAll("metadataHeaders")).toEqual([
      "Subject",
      "From",
      "Date",
    ]);
    expect(init.headers).toEqual({
      Authorization: "Bearer user-t",
      "X-Goog-Gmail-Access-Token": "msg-t",
    });
  });

  it("gives up quietly when Gmail says no or doesn't answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 403 })),
    );
    expect(await fetchMessageMetadata(input)).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await fetchMessageMetadata(input)).toBeNull();
  });
});

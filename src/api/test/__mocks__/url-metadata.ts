import { vi } from "vitest";
import type {
  UrlMetadata,
  UrlMetadataResult,
} from "../../src/lib/url-metadata";

/**
 * Mock for src/lib/url-metadata.ts - prevents outbound HTTP requests in tests.
 *
 * Usage in tests:
 *   import { mockFetchUrlMetadata, resetUrlMetadataMock } from "../__mocks__/url-metadata";
 *
 *   beforeEach(() => resetUrlMetadataMock());
 *
 *   it("uses fetched metadata", async () => {
 *     mockFetchUrlMetadata({ title: "Example" });
 *     // ... test code
 *   });
 *
 * `mockFailedUrlFetch()` stands in for an unreachable page, which the real
 * module reports as `ok: false` rather than empty metadata.
 */

const NULL_METADATA: UrlMetadata = {
  title: null,
  description: null,
  siteName: null,
  favicon: null,
  image: null,
};

export const fetchUrlMetadataResult = vi.fn<
  [url: string],
  Promise<UrlMetadataResult>
>(async () => ({ ok: true, metadata: NULL_METADATA }));

export const fetchUrlMetadata = vi.fn<[url: string], Promise<UrlMetadata>>(
  async (url) => (await fetchUrlMetadataResult(url)).metadata,
);

// Pure predicate — no network, so the real implementation is what tests want.
// Kept in sync by hand with url-metadata.ts's TWEET_URL_RE.
const TWEET_URL_RE =
  /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?:[^/?#]+|i\/(?:web\/)?)\/?status(?:es)?\/(\d+)/i;

export function isSocialPostUrl(url: string): boolean {
  return TWEET_URL_RE.test(url);
}

/**
 * Configure the mock to return specific metadata for the next fetch.
 */
export function mockFetchUrlMetadata(metadata: Partial<UrlMetadata>): void {
  fetchUrlMetadataResult.mockResolvedValueOnce({
    ok: true,
    metadata: { ...NULL_METADATA, ...metadata },
  });
}

/**
 * Configure the mock so the next fetch reads as unreachable — the case that
 * lands a URL row in `failed` and offers the user a retry.
 */
export function mockFailedUrlFetch(): void {
  fetchUrlMetadataResult.mockResolvedValueOnce({
    ok: false,
    metadata: NULL_METADATA,
  });
}

/**
 * Reset all mock state. Call in beforeEach to ensure clean state.
 */
export function resetUrlMetadataMock(): void {
  fetchUrlMetadataResult.mockReset();
  fetchUrlMetadata.mockReset();
  // Default: reachable page with no usable tags (no network requests).
  fetchUrlMetadataResult.mockResolvedValue({
    ok: true,
    metadata: NULL_METADATA,
  });
  fetchUrlMetadata.mockImplementation(
    async (url) => (await fetchUrlMetadataResult(url)).metadata,
  );
}

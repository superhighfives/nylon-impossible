import { vi } from "vitest";
import type { UrlMetadata } from "../../src/lib/url-metadata";

/**
 * Mock for src/lib/url-metadata.ts - prevents outbound HTTP requests in tests.
 *
 * Usage in tests:
 *   import { mockFetchUrlMetadata, resetUrlMetadataMock } from "../__mocks__/url-metadata";
 *
 *   beforeEach(() => resetUrlMetadataMock());
 *
 *   it("uses fetched metadata", async () => {
 *     mockFetchUrlMetadata({ title: "Example", description: null, siteName: null, favicon: null });
 *     // ... test code
 *   });
 */

const NULL_METADATA: UrlMetadata = {
  title: null,
  description: null,
  siteName: null,
  favicon: null,
};

export const fetchUrlMetadata = vi.fn<[url: string], Promise<UrlMetadata>>(
  async () => NULL_METADATA,
);

/**
 * Configure the mock to return specific metadata.
 */
export function mockFetchUrlMetadata(metadata: Partial<UrlMetadata>): void {
  fetchUrlMetadata.mockResolvedValueOnce({ ...NULL_METADATA, ...metadata });
}

/**
 * Reset all mock state. Call in beforeEach to ensure clean state.
 */
export function resetUrlMetadataMock(): void {
  fetchUrlMetadata.mockReset();
  // Default: return null metadata (no network requests)
  fetchUrlMetadata.mockResolvedValue(NULL_METADATA);
}

import type { UrlMetadata } from "../../src/lib/url-metadata";

/**
 * Mock for src/lib/url-metadata.ts - returns null metadata immediately.
 * Prevents real HTTP requests during tests.
 */
export async function fetchUrlMetadata(_url: string): Promise<UrlMetadata> {
  return {
    title: null,
    description: null,
    siteName: null,
    favicon: null,
  };
}

import { describe, expect, it } from "vitest";
import wranglerConfig from "../../wrangler.jsonc?raw";
import { ADDON_ACTIONS } from "../../src/lib/addon-cards";

// Google signs each add-on request with the endpoint URL as its `aud`, and the
// API only accepts the URLs listed in GMAIL_ADDON_AUDIENCE. An action the cards
// can call but the list leaves out fails with a 401 in Gmail, which the
// integration tests can't see: they mint their own tokens for one audience.
const ENDPOINTS = [
  "/gmail-addon/homepage",
  "/gmail-addon/contextual",
  ...Object.values(ADDON_ACTIONS),
];

describe("GMAIL_ADDON_AUDIENCE", () => {
  const lists = [
    ...wranglerConfig.matchAll(/"GMAIL_ADDON_AUDIENCE":\s*"([^"]*)"/g),
  ].map((match) => match[1].split(","));

  it("is set for production and previews", () => {
    expect(lists).toHaveLength(2);
  });

  it("lists every endpoint the cards call", () => {
    for (const list of lists) {
      for (const path of ENDPOINTS) {
        expect(list).toContain(`https://api.nylonimpossible.com${path}`);
      }
    }
  });
});

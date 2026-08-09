import { defineConfig } from "@flue/runtime/config";

export default defineConfig({
  target: "cloudflare",
  // Only registers the Workers AI provider — no anthropic/openai API-key
  // paths. Per the spike, this didn't measurably shrink the build (this
  // agent never registered other providers to begin with), but it's still
  // the correct minimal config.
  providers: ["cloudflare"],
});

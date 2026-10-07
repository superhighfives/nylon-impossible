import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { sentryVitePlugin } from '@sentry/vite-plugin'

const config = defineConfig({
  build: {
    sourcemap: "hidden",
  },
  plugins: [
    devtools(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      persistState: { path: '../../.wrangler/state' },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // Upload source maps to Sentry on production builds
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [sentryVitePlugin({
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_WEB_PROJECT,
          authToken: process.env.SENTRY_AUTH_TOKEN,
        })]
      : []),
  ],
  optimizeDeps: {
    include: ["cookie"],
  },
  resolve: {
    // Replaces the vite-tsconfig-paths plugin; Vite 8 resolves tsconfig
    // `paths` aliases natively.
    tsconfigPaths: true,
    alias: [
      {
        find: "use-sync-external-store/shim/index.js",
        replacement: "react",
      },
    ],
  },
})

export default config

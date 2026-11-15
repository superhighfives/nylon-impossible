// Stand-in for the Workers runtime's `cloudflare:workers` module, which only
// exists inside workerd. Tests that need particular bindings vi.mock it.
export const env = {};

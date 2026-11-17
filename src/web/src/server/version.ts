// `GET /version`: the commit this worker was built from, so an open tab can
// tell it's running an older bundle (hooks/useReloadOnNewBuild.ts). The worker
// and the client bundle come out of the same build, so they share
// VITE_COMMIT_SHA (see vite.config.ts). Local dev has none: `commit` is null.
export const VERSION_PATH = "/version";

export function versionResponse(request: Request): Response | null {
  const { pathname } = new URL(request.url);
  if (pathname !== VERSION_PATH || request.method !== "GET") return null;
  return Response.json(
    { commit: import.meta.env.VITE_COMMIT_SHA || null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

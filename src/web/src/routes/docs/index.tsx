import { createFileRoute, redirect } from "@tanstack/react-router";

// API is the only docs page for now, so /docs goes straight to it. A docs
// index waits until there's a second page to list.
export const Route = createFileRoute("/docs/")({
  beforeLoad: () => {
    throw redirect({ to: "/docs/api" });
  },
});

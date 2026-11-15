import { createFileRoute } from "@tanstack/react-router";
import { ApiDocsPage } from "@/components/ApiDocsPage";

export const Route = createFileRoute("/docs/api")({
  component: ApiDocsPage,
  head: () => ({ meta: [{ title: "API — Nylon Impossible" }] }),
});

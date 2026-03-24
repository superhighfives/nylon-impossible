import { createFileRoute } from "@tanstack/react-router";
import { AppMock } from "@/components/AppMock";

function PreviewPage() {
  return <AppMock />;
}

export const Route = createFileRoute("/preview")({ component: PreviewPage });

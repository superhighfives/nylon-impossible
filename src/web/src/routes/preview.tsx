import { createFileRoute } from "@tanstack/react-router";
import { AppMock } from "@/components/AppMock";

export const Route = createFileRoute("/preview")({ component: AppMock });

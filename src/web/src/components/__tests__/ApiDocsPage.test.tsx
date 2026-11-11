import {
  V1_ERRORS,
  V1_LIST_EXAMPLE,
  V1_TODO_EXAMPLE,
} from "@nylon-impossible/shared/api-v1";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiDocsPage } from "../ApiDocsPage";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("ApiDocsPage", () => {
  it("has the six sections, in order", () => {
    render(<ApiDocsPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("API");
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      "Authentication",
      "Routes",
      "Responses",
      "Rate limit",
      "Errors",
      "Versioning",
    ]);
  });

  it("lists every route, the aliases, paging and a curl example", () => {
    const { container } = render(<ApiDocsPage />);
    const text = container.textContent ?? "";
    for (const route of [
      "GET /v1/lists",
      "GET /v1/lists/:id",
      "GET /v1/lists/:id/todos",
      "GET /v1/todos/:id",
    ]) {
      expect(screen.getByText(route)).toBeInTheDocument();
    }
    for (const word of [
      "today",
      "this-week",
      "someday",
      "?done=true",
      "?limit=",
      "?cursor=",
      "nextCursor",
    ]) {
      expect(screen.getAllByText(word).length).toBeGreaterThan(0);
    }
    expect(text).toContain(
      'curl -H "Authorization: Bearer nyl_…" \\\n  https://api.nylonimpossible.com/v1/lists/today/todos',
    );
    expect(text).toContain("Authorization: Bearer nyl_…");
  });

  it("shows the shared List and Todo examples, every field present", () => {
    const { container } = render(<ApiDocsPage />);
    const blocks = Array.from(container.querySelectorAll("pre")).map(
      (pre) => pre.textContent,
    );
    expect(blocks).toContain(JSON.stringify(V1_LIST_EXAMPLE, null, 2));
    expect(blocks).toContain(JSON.stringify(V1_TODO_EXAMPLE, null, 2));
  });

  it("tabulates every error code /v1 returns, with its status", () => {
    render(<ApiDocsPage />);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    const cells = rows.slice(1).map((row) =>
      within(row)
        .getAllByRole("cell")
        .slice(0, 2)
        .map((c) => c.textContent),
    );
    expect(cells).toEqual(
      Object.entries(V1_ERRORS).map(([code, status]) => [code, String(status)]),
    );
  });

  it("states the rate limit and the versioning promise", () => {
    const { container } = render(<ApiDocsPage />);
    const text = container.textContent ?? "";
    expect(text).toContain("60 requests a minute per token");
    expect(text).toContain("Retry-After");
    expect(text).toContain("at least 6 months");
    expect(text).toContain("Deprecation");
  });

  it("uses the Vocabulary", () => {
    const { container } = render(<ApiDocsPage />);
    const prose = Array.from(container.querySelectorAll("p, li, td"))
      .map((el) => el.textContent)
      .join(" ");
    expect(prose).not.toMatch(/\btasks?\b|Completed|Sometime|\bURLs\b/);
  });
});

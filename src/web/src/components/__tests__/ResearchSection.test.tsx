import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SerializedResearch, SerializedTodoUrl } from "@/types/database";
import { ResearchSection } from "../ResearchSection";

vi.mock("@/hooks/useTodos", () => ({
  SHOW_RETRY_MS: 30_000,
  STALE_RESEARCH_MS: 5 * 60 * 1_000,
  useReresearch: vi.fn(),
  useCancelResearch: vi.fn(),
}));

import { useCancelResearch, useReresearch } from "@/hooks/useTodos";

const NOW = new Date("2026-01-01T00:10:00.000Z");

function makeResearch(
  overrides?: Partial<SerializedResearch>,
): SerializedResearch {
  return {
    id: "r1",
    status: "completed",
    researchType: "general",
    summary: null,
    researchedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

function makeUrl(overrides?: Partial<SerializedTodoUrl>): SerializedTodoUrl {
  return {
    id: "u1",
    todoId: "t1",
    researchId: "r1",
    url: "https://example.com/article",
    title: "Example article",
    description: null,
    siteName: "Example",
    favicon: null,
    image: null,
    position: "a0",
    fetchStatus: "fetched",
    fetchedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe("ResearchSection", () => {
  const reresearch = { mutate: vi.fn(), isPending: false };
  const cancelResearch = { mutate: vi.fn(), isPending: false };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    reresearch.mutate.mockClear();
    reresearch.isPending = false;
    cancelResearch.mutate.mockClear();
    cancelResearch.isPending = false;
    vi.mocked(useReresearch).mockReturnValue(
      reresearch as unknown as ReturnType<typeof useReresearch>,
    );
    vi.mocked(useCancelResearch).mockReturnValue(
      cancelResearch as unknown as ReturnType<typeof useCancelResearch>,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a spinner for a fresh pending research", () => {
    render(
      <ResearchSection
        todoId="t1"
        research={makeResearch({
          status: "pending",
          createdAt: new Date(NOW.getTime() - 1_000).toISOString(),
        })}
        researchUrls={[]}
      />,
    );
    expect(screen.getByText(/researching/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /try again/i }),
    ).not.toBeInTheDocument();
  });

  it("offers Cancel + Try again once past the retry threshold", () => {
    render(
      <ResearchSection
        todoId="t1"
        research={makeResearch({
          status: "pending",
          createdAt: new Date(NOW.getTime() - 45_000).toISOString(),
        })}
        researchUrls={[]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(cancelResearch.mutate).toHaveBeenCalledWith("t1");
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reresearch.mutate).toHaveBeenCalledWith("t1");
  });

  it("reports a timeout once research is stale", () => {
    render(
      <ResearchSection
        todoId="t1"
        research={makeResearch({
          status: "pending",
          createdAt: new Date(NOW.getTime() - 10 * 60 * 1000).toISOString(),
        })}
        researchUrls={[]}
      />,
    );
    expect(screen.getByText(/research timed out/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument();
  });

  it("shows a failed state with a retry button", () => {
    render(
      <ResearchSection
        todoId="t1"
        research={makeResearch({ status: "failed" })}
        researchUrls={[]}
      />,
    );
    expect(screen.getByText(/research failed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reresearch.mutate).toHaveBeenCalledWith("t1");
  });

  it("renders the completed summary with numbered source cards", () => {
    render(
      <ResearchSection
        todoId="t1"
        research={makeResearch({ summary: "Solid answer [1]." })}
        researchUrls={[makeUrl(), makeUrl({ id: "u2", url: "https://b.com" })]}
      />,
    );
    expect(screen.getByText(/solid answer/i)).toBeInTheDocument();
    // Citation link for [1]
    expect(screen.getByRole("link", { name: "[1]" })).toHaveAttribute(
      "href",
      "https://example.com/article",
    );
    // Two source cards
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("falls back to a no-sources message when completed research has nothing to show", () => {
    render(
      <ResearchSection
        todoId="t1"
        research={makeResearch({ summary: null })}
        researchUrls={[]}
      />,
    );
    expect(screen.getByText(/no relevant sources found/i)).toBeInTheDocument();
  });
});

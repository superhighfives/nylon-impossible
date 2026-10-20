import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutSwitch } from "../LayoutSwitch";

function mockViewport(wide: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: wide,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

const tree = (
  <LayoutSwitch phone={<p>phone layout</p>} wide={<p>wide board</p>} />
);

describe("LayoutSwitch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders both on the server, inside CSS-switched wrappers", () => {
    const html = renderToString(tree);
    expect(html).toContain("phone layout");
    expect(html).toContain("wide board");
    expect(html).toMatch(/data-layout="phone" class="contents lg:hidden"/);
    expect(html).toMatch(/data-layout="wide" class="hidden lg:contents"/);
  });

  it("keeps only the phone layout under 1024px", () => {
    mockViewport(false);
    render(tree);
    expect(screen.getByText("phone layout")).toBeInTheDocument();
    expect(screen.queryByText("wide board")).toBeNull();
  });

  it("keeps only the board at 1024px and up", () => {
    mockViewport(true);
    render(tree);
    expect(screen.getByText("wide board")).toBeInTheDocument();
    expect(screen.queryByText("phone layout")).toBeNull();
    expect(window.matchMedia).toHaveBeenCalledWith("(min-width: 1024px)");
  });
});

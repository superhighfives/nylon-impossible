import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DevEnvironmentIndicator from "../DevEnvironmentIndicator";

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ pathname: "/tasks", searchStr: "" }),
}));

vi.mock("../../lib/config", () => ({
  API_URL: "https://api.nylonimpossible.com",
}));

describe("DevEnvironmentIndicator", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    import.meta.env.PROD = false;
  });

  it("shows in development builds", () => {
    render(<DevEnvironmentIndicator />);
    expect(screen.getByText("api")).toBeInTheDocument();
    expect(screen.getByText("https://api.nylonimpossible.com")).toBeInTheDocument();
  });

  it("shows on preview deploy hostnames in production builds", async () => {
    import.meta.env.PROD = true;
    vi.stubGlobal("location", {
      hostname: "pr-42.nylonimpossible.com",
      origin: "https://pr-42.nylonimpossible.com",
    });

    render(<DevEnvironmentIndicator />);

    await waitFor(() => {
      expect(screen.getByText("api")).toBeInTheDocument();
    });
  });

  it("hides on production non-preview hostnames", () => {
    import.meta.env.PROD = true;
    vi.stubGlobal("location", {
      hostname: "nylonimpossible.com",
      origin: "https://nylonimpossible.com",
    });

    render(<DevEnvironmentIndicator />);

    expect(screen.queryByText("api")).not.toBeInTheDocument();
  });

  it("matches preview hostname pattern correctly", async () => {
    import.meta.env.PROD = true;

    const previewHosts = [
      "pr-1.nylonimpossible.com",
      "pr-99.nylonimpossible.com",
      "pr-123.nylonimpossible.com",
    ];

    for (const hostname of previewHosts) {
      vi.stubGlobal("location", { hostname, origin: `https://${hostname}` });
      const { unmount } = render(<DevEnvironmentIndicator />);
      await waitFor(() => {
        expect(screen.getByText("api")).toBeInTheDocument();
      });
      unmount();
    }
  });

  it("does not match non-preview hostnames", () => {
    import.meta.env.PROD = true;

    const nonPreviewHosts = [
      "nylonimpossible.com",
      "www.nylonimpossible.com",
      "api.nylonimpossible.com",
      "api-pr-42.nylonimpossible.com",
      "localhost",
    ];

    for (const hostname of nonPreviewHosts) {
      vi.stubGlobal("location", { hostname, origin: `https://${hostname}` });
      const { unmount } = render(<DevEnvironmentIndicator />);
      expect(screen.queryByText("api")).not.toBeInTheDocument();
      unmount();
    }
  });
});

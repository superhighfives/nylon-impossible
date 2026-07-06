import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DevEnvironmentIndicator from "../DevEnvironmentIndicator";

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ href: "/tasks" }),
}));

const mockConfig = vi.hoisted(() => ({
  API_URL: "https://api.nylonimpossible.com",
  IS_PRODUCTION_API: false,
}));

vi.mock("../../lib/config", () => mockConfig);

describe("DevEnvironmentIndicator", () => {
  afterEach(() => {
    import.meta.env.PROD = false;
    mockConfig.IS_PRODUCTION_API = false;
  });

  it("shows in development builds", () => {
    render(<DevEnvironmentIndicator origin="http://localhost:3000" />);
    expect(screen.getByText("api")).toBeInTheDocument();
    expect(
      screen.getByText("https://api.nylonimpossible.com"),
    ).toBeInTheDocument();
  });

  it("shows the full current URL", () => {
    render(<DevEnvironmentIndicator origin="http://localhost:3000" />);
    expect(screen.getByText("http://localhost:3000/tasks")).toBeInTheDocument();
  });

  it("flags a production badge when local dev hits the production API", () => {
    mockConfig.IS_PRODUCTION_API = true;
    render(<DevEnvironmentIndicator origin="http://localhost:3000" />);
    expect(screen.getByText("production")).toBeInTheDocument();
  });

  it("does not flag production for the local API", () => {
    render(<DevEnvironmentIndicator origin="http://localhost:3000" />);
    expect(screen.queryByText("production")).not.toBeInTheDocument();
  });

  it("shows on preview deploy origins in production builds", () => {
    import.meta.env.PROD = true;
    render(
      <DevEnvironmentIndicator origin="https://pr-42.nylonimpossible.com" />,
    );
    expect(screen.getByText("api")).toBeInTheDocument();
  });

  it("hides on production non-preview origins", () => {
    import.meta.env.PROD = true;
    render(<DevEnvironmentIndicator origin="https://nylonimpossible.com" />);
    expect(screen.queryByText("api")).not.toBeInTheDocument();
  });

  it("matches preview hostname pattern correctly", () => {
    import.meta.env.PROD = true;
    const previewOrigins = [
      "https://pr-1.nylonimpossible.com",
      "https://pr-99.nylonimpossible.com",
      "https://pr-123.nylonimpossible.com",
    ];

    for (const origin of previewOrigins) {
      const { unmount } = render(<DevEnvironmentIndicator origin={origin} />);
      expect(screen.getByText("api")).toBeInTheDocument();
      unmount();
    }
  });

  it("does not match non-preview origins", () => {
    import.meta.env.PROD = true;
    const nonPreviewOrigins = [
      "https://nylonimpossible.com",
      "https://www.nylonimpossible.com",
      "https://api.nylonimpossible.com",
      "https://api-pr-42.nylonimpossible.com",
      "http://localhost:3000",
    ];

    for (const origin of nonPreviewOrigins) {
      const { unmount } = render(<DevEnvironmentIndicator origin={origin} />);
      expect(screen.queryByText("api")).not.toBeInTheDocument();
      unmount();
    }
  });
});

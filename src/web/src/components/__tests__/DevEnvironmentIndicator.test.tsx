import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DevEnvironmentIndicator, {
  DevEnvironmentDetails,
} from "../DevEnvironmentIndicator";

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ href: "/tasks" }),
}));

vi.mock("../../lib/config", () => ({
  API_URL: "https://api.nylonimpossible.com",
}));

describe("DevEnvironmentDetails", () => {
  afterEach(() => {
    import.meta.env.PROD = false;
  });

  it("shows in development builds", () => {
    render(<DevEnvironmentDetails origin="http://localhost:3000" />);
    expect(screen.getByText("api")).toBeInTheDocument();
    expect(
      screen.getByText("https://api.nylonimpossible.com"),
    ).toBeInTheDocument();
  });

  it("shows the full current URL", () => {
    render(<DevEnvironmentDetails origin="http://localhost:3000" />);
    expect(screen.getByText("http://localhost:3000/tasks")).toBeInTheDocument();
  });

  it("shows on preview deploy origins in production builds", () => {
    import.meta.env.PROD = true;
    render(
      <DevEnvironmentDetails origin="https://pr-42.nylonimpossible.com" />,
    );
    expect(screen.getByText("api")).toBeInTheDocument();
  });

  it("hides on production non-preview origins", () => {
    import.meta.env.PROD = true;
    render(<DevEnvironmentDetails origin="https://nylonimpossible.com" />);
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
      const { unmount } = render(<DevEnvironmentDetails origin={origin} />);
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
      const { unmount } = render(<DevEnvironmentDetails origin={origin} />);
      expect(screen.queryByText("api")).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe("DevEnvironmentIndicator", () => {
  afterEach(() => {
    import.meta.env.PROD = false;
  });

  it("renders a trigger button in development", () => {
    render(<DevEnvironmentIndicator origin="http://localhost:3000" />);
    expect(
      screen.getByRole("button", { name: "Environment details" }),
    ).toBeInTheDocument();
  });

  it("renders nothing on production non-preview origins", () => {
    import.meta.env.PROD = true;
    render(<DevEnvironmentIndicator origin="https://nylonimpossible.com" />);
    expect(
      screen.queryByRole("button", { name: "Environment details" }),
    ).not.toBeInTheDocument();
  });
});

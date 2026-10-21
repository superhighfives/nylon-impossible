import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { LANDING_COPY, LandingPage } from "../LandingPage";

vi.mock("@clerk/tanstack-react-start", () => ({
  SignInButton: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SignUpButton: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

describe("LandingPage", () => {
  it("renders Sign in and Create account buttons", () => {
    render(<LandingPage />);
    expect(screen.getAllByRole("button", { name: "Sign in" }).length).toBe(2);
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeInTheDocument();
  });

  it("leads with the headline and subhead", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: LANDING_COPY.headline }),
    ).toBeInTheDocument();
    expect(screen.getByText(LANDING_COPY.subhead)).toBeInTheDocument();
  });

  it("names the three horizons in order", () => {
    render(<LandingPage />);
    const horizons = screen
      .getAllByRole("heading", { level: 3 })
      .slice(0, 3)
      .map((h) => h.textContent);
    expect(horizons).toEqual(["Today", "This Week", "Someday"]);
  });

  it("keeps the privacy and terms links", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
  });

  it("makes no AI claims and uses the Vocabulary", () => {
    const { container } = render(<LandingPage />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\bAI\b|task|Sometime|Completed/);
  });
});

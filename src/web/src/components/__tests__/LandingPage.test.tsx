import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "../LandingPage";

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
    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.getByText("Create account")).toBeInTheDocument();
  });

  it("renders descriptive text", () => {
    render(<LandingPage />);
    expect(
      screen.getByText(
        "A fast todo app for web and iOS. Capture anything, and keep it in sync everywhere.",
      ),
    ).toBeInTheDocument();
  });
});

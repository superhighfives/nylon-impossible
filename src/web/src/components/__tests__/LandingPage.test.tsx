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
        "A todo app for web and iOS. Describe what you need to do — AI handles the rest.",
      ),
    ).toBeInTheDocument();
  });
});

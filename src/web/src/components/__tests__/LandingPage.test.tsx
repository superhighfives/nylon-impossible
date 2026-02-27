import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingPage } from "../LandingPage";

vi.mock("@clerk/tanstack-react-start", () => ({
  SignInButton: ({ children }: any) => <div>{children}</div>,
  SignUpButton: ({ children }: any) => <div>{children}</div>,
}));

vi.mock("@cloudflare/kumo", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));

describe("LandingPage", () => {
  it("renders Sign In and Sign Up buttons", () => {
    render(<LandingPage />);
    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByText("Sign Up")).toBeInTheDocument();
  });

  it("renders descriptive text", () => {
    render(<LandingPage />);
    expect(
      screen.getByText("A todo app to keep you organized."),
    ).toBeInTheDocument();
  });
});

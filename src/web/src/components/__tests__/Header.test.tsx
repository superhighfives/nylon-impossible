import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import Header from "../Header";

vi.mock("@clerk/tanstack-react-start", () => ({
  SignedIn: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  UserButton: () => <div data-testid="user-button" />,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

describe("Header", () => {
  it("renders 'Nylon Impossible' link", () => {
    render(<Header />);
    const link = screen.getByText("Nylon Impossible");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });
});

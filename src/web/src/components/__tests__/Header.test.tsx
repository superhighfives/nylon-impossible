import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Header from "../Header";

vi.mock("@clerk/tanstack-react-start", () => ({
  SignedIn: ({ children }: any) => <div>{children}</div>,
  UserButton: () => <div data-testid="user-button" />,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
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

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import Header from "../Header";

vi.mock("@clerk/tanstack-react-start", () => ({
  SignedIn: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  UserButton: () => <div data-testid="user-button" />,
  useAuth: () => ({ getToken: () => Promise.resolve("mock-token") }),
}));

vi.mock("@/hooks/useUser", () => ({
  useUser: () => ({ data: null, isLoading: true }),
  useUpdateUser: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...rest
  }: { children: ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

describe("Header", () => {
  it("renders 'Nylon Impossible' link", () => {
    render(<Header />);
    const link = screen.getByRole("link", { name: "Nylon Impossible" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });
});

import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/helpers";
import Header from "../Header";

vi.mock("@clerk/tanstack-react-start", () => ({
  SignedIn: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  UserButton: () => <div data-testid="user-button" />,
  useAuth: () => ({
    getToken: vi.fn().mockResolvedValue("test-token"),
  }),
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
    renderWithProviders(<Header />);
    const link = screen.getByRole("link", { name: "Nylon Impossible" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });
});

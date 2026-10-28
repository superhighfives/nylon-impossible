import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LANDING_COPY, LandingPage } from "../LandingPage";

const joinWaitlist = vi.fn();

vi.mock("@clerk/tanstack-react-start", () => ({
  SignInButton: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  useClerk: () => ({ joinWaitlist }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

function submitEmail(email: string) {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole("button", { name: "Join the waitlist" }));
}

describe("LandingPage", () => {
  beforeEach(() => {
    joinWaitlist.mockReset();
  });

  it("offers the waitlist and one Sign in, but no sign-up", () => {
    render(<LandingPage />);
    expect(screen.getByText(LANDING_COPY.eyebrow)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Join the waitlist" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sign in" }).length).toBe(1);
    expect(
      screen.queryByRole("button", { name: "Create account" }),
    ).not.toBeInTheDocument();
  });

  it("joins the waitlist and confirms", async () => {
    joinWaitlist.mockResolvedValue({});
    render(<LandingPage />);
    submitEmail(" sam@example.com ");
    expect(await screen.findByRole("status")).toHaveTextContent(
      LANDING_COPY.joined,
    );
    expect(joinWaitlist).toHaveBeenCalledWith({
      emailAddress: "sam@example.com",
    });
  });

  it("shows Clerk's message when joining fails", async () => {
    joinWaitlist.mockRejectedValue({
      errors: [{ longMessage: "Enter a valid email address." }],
    });
    render(<LandingPage />);
    submitEmail("sam@example.com");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid email address.",
    );
    expect(
      screen.getByRole("button", { name: "Join the waitlist" }),
    ).toBeEnabled();
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
    expect(horizons).toEqual(["Today", "This week", "Someday"]);
  });

  it("lists every platform", () => {
    render(<LandingPage />);
    for (const name of ["Web", "Web on your phone", "iPhone", "iPad", "Mac"]) {
      expect(
        screen.getByRole("heading", { level: 3, name }),
      ).toBeInTheDocument();
    }
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

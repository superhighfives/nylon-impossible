import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiToggle } from "../AiToggle";

const mockMutate = vi.fn();

vi.mock("@/hooks/useUser", () => ({
  useUser: vi.fn(),
  useUpdateUser: vi.fn(),
}));

import { useUpdateUser, useUser } from "@/hooks/useUser";

describe("AiToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when loading", () => {
    vi.mocked(useUser).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useUser>);
    vi.mocked(useUpdateUser).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateUser>);

    const { container } = render(<AiToggle />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when user is undefined", () => {
    vi.mocked(useUser).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUser>);
    vi.mocked(useUpdateUser).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateUser>);

    const { container } = render(<AiToggle />);
    expect(container.firstChild).toBeNull();
  });

  it("renders with aria-checked=true when AI is enabled", () => {
    vi.mocked(useUser).mockReturnValue({
      data: {
        id: "1",
        email: "test@example.com",
        aiEnabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      isLoading: false,
    } as ReturnType<typeof useUser>);
    vi.mocked(useUpdateUser).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateUser>);

    render(<AiToggle />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveAttribute("aria-label", "Disable AI features");
  });

  it("renders with aria-checked=false when AI is disabled", () => {
    vi.mocked(useUser).mockReturnValue({
      data: {
        id: "1",
        email: "test@example.com",
        aiEnabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      isLoading: false,
    } as ReturnType<typeof useUser>);
    vi.mocked(useUpdateUser).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateUser>);

    render(<AiToggle />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAttribute("aria-label", "Enable AI features");
  });

  it("calls mutate with inverted value when clicked", () => {
    vi.mocked(useUser).mockReturnValue({
      data: {
        id: "1",
        email: "test@example.com",
        aiEnabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      isLoading: false,
    } as ReturnType<typeof useUser>);
    vi.mocked(useUpdateUser).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateUser>);

    render(<AiToggle />);
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    expect(mockMutate).toHaveBeenCalledWith({ aiEnabled: false });
  });

  it("disables button when isPending is true", () => {
    vi.mocked(useUser).mockReturnValue({
      data: {
        id: "1",
        email: "test@example.com",
        aiEnabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      isLoading: false,
    } as ReturnType<typeof useUser>);
    vi.mocked(useUpdateUser).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    } as unknown as ReturnType<typeof useUpdateUser>);

    render(<AiToggle />);
    const toggle = screen.getByRole("switch");
    expect(toggle).toBeDisabled();
  });
});

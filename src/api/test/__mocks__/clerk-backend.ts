import { vi } from "vitest";

export const verifyToken = vi.fn().mockResolvedValue({ sub: "user_test_123" });

export const createClerkClient = vi.fn(() => ({
  users: {
    getUser: vi.fn().mockResolvedValue({
      emailAddresses: [{ emailAddress: "test@example.com" }],
    }),
  },
}));

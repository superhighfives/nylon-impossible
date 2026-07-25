import { vi } from "vitest";

export const verifyToken = vi.fn().mockResolvedValue({ sub: "user_test_123" });

// Stable mock fns so tests can configure return values (e.g. getUserList for
// the Gmail add-on auto-link path). Reset + set per test as needed.
export const mockGetUser = vi.fn().mockResolvedValue({
  emailAddresses: [{ emailAddress: "test@example.com" }],
});

export const mockGetUserList = vi.fn().mockResolvedValue({
  data: [],
  totalCount: 0,
});

export const mockGetUserOauthAccessToken = vi.fn().mockResolvedValue({
  data: [],
});

export const createClerkClient = vi.fn(() => ({
  users: {
    getUser: mockGetUser,
    getUserList: mockGetUserList,
    getUserOauthAccessToken: mockGetUserOauthAccessToken,
  },
}));

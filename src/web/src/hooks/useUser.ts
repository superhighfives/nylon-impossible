import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "@/lib/config";

export type Theme = "light" | "dark" | "system";

/** The last aging sweep that moved anything (`GET /users/me`). */
export interface LastSweep {
  /** ISO instant the sweep ran. */
  at: string;
  movedToThisWeek: number;
  movedToSomeday: number;
}

export interface User {
  id: string;
  email: string;
  theme: Theme;
  timezone: string;
  // Absent from servers that predate it; treat a missing value as true.
  timezoneAuto?: boolean;
  // Null until a sweep has moved something; absent from older servers.
  lastSweep?: LastSweep | null;
  // Admins see the feedback button. Absent from older servers.
  isAdmin?: boolean;
  createdAt: string;
  updatedAt: string;
}

type UserUpdate = {
  theme?: Theme;
  timezone?: string;
  timezoneAuto?: boolean;
};

const USER_QUERY_KEY = ["user", "me"] as const;

async function fetchUser(
  getToken: () => Promise<string | null>,
): Promise<User> {
  const token = await getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(`${API_URL}/users/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error("Failed to fetch user");
  }
  return response.json();
}

async function updateUser(
  data: UserUpdate,
  getToken: () => Promise<string | null>,
): Promise<User> {
  const token = await getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(`${API_URL}/users/me`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to update user");
  }
  return response.json();
}

export function useUser() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: USER_QUERY_KEY,
    queryFn: () => fetchUser(getToken),
    // No /users/me to fetch when signed out — keeps ThemeSync (mounted app-wide)
    // from firing failing requests on the logged-out landing page.
    enabled: !!isSignedIn,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

async function deleteCurrentUser(
  getToken: () => Promise<string | null>,
): Promise<void> {
  const token = await getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(`${API_URL}/users/me`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("Failed to delete account");
  }
}

export function useDeleteCurrentUser() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: () => deleteCurrentUser(getToken),
  });
}

export function useUpdateUser() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UserUpdate) => updateUser(data, getToken),
    onMutate: async (newData) => {
      await queryClient.cancelQueries({ queryKey: USER_QUERY_KEY });
      const previousUser = queryClient.getQueryData<User>(USER_QUERY_KEY);

      if (previousUser) {
        // Only spread defined values so an omitted field keeps its value.
        const updates: Partial<User> = {};
        if (newData.theme !== undefined) {
          updates.theme = newData.theme;
        }
        if (newData.timezone !== undefined) {
          updates.timezone = newData.timezone;
        }
        if (newData.timezoneAuto !== undefined) {
          updates.timezoneAuto = newData.timezoneAuto;
        }
        queryClient.setQueryData<User>(USER_QUERY_KEY, {
          ...previousUser,
          ...updates,
        });
      }

      return { previousUser };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousUser) {
        queryClient.setQueryData(USER_QUERY_KEY, context.previousUser);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: USER_QUERY_KEY });
    },
  });
}

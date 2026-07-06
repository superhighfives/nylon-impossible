import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "@/lib/config";

export type Theme = "light" | "dark" | "system";

export interface User {
  id: string;
  email: string;
  aiEnabled: boolean;
  plan: "free" | "pro";
  location: string | null;
  theme: Theme;
  hideCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

type UserUpdate = {
  aiEnabled?: boolean;
  location?: string | null;
  theme?: Theme;
  hideCompleted?: boolean;
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
        // Only spread defined values to preserve explicit null for location
        const updates: Partial<User> = {};
        if (newData.aiEnabled !== undefined) {
          updates.aiEnabled = newData.aiEnabled;
        }
        if (newData.location !== undefined) {
          updates.location = newData.location;
        }
        if (newData.theme !== undefined) {
          updates.theme = newData.theme;
        }
        if (newData.hideCompleted !== undefined) {
          updates.hideCompleted = newData.hideCompleted;
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

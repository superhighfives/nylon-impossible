import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "@/lib/config";

interface User {
  id: string;
  email: string;
  aiEnabled: boolean;
  location: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  data: { aiEnabled?: boolean; location?: string | null },
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
  const { getToken } = useAuth();

  return useQuery({
    queryKey: USER_QUERY_KEY,
    queryFn: () => fetchUser(getToken),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useUpdateUser() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { aiEnabled?: boolean; location?: string | null }) =>
      updateUser(data, getToken),
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

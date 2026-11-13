import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL } from "@/lib/config";

/** `GET /users/me/api-token`: when it was made and last used, never the token. */
export interface ApiTokenInfo {
  createdAt: string;
  lastUsedAt: string | null;
}

/** `POST /users/me/api-token`: the only response that carries the token. */
export interface CreatedApiToken {
  token: string;
  createdAt: string;
}

const API_TOKEN_QUERY_KEY = ["user", "me", "api-token"] as const;

async function request(
  method: "GET" | "POST" | "DELETE",
  getToken: () => Promise<string | null>,
  failure: string,
): Promise<Response> {
  const session = await getToken();
  if (!session) throw new Error("Not authenticated");
  const response = await fetch(`${API_URL}/users/me/api-token`, {
    method,
    headers: { Authorization: `Bearer ${session}` },
  });
  if (!response.ok) throw new Error(failure);
  return response;
}

export function useApiToken(enabled: boolean) {
  const { getToken, isSignedIn } = useAuth();
  return useQuery({
    queryKey: API_TOKEN_QUERY_KEY,
    queryFn: async () => {
      const response = await request("GET", getToken, "Couldn't load token");
      const body = (await response.json()) as { token: ApiTokenInfo | null };
      return body.token;
    },
    enabled: enabled && !!isSignedIn,
  });
}

/** Creates the token, or replaces the existing one (Regenerate). */
export function useCreateApiToken() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (regenerate: boolean) => {
      const response = await request(
        "POST",
        getToken,
        regenerate ? "Couldn't regenerate token" : "Couldn't create token",
      );
      return (await response.json()) as CreatedApiToken;
    },
    onSuccess: ({ createdAt }) => {
      const info: ApiTokenInfo = { createdAt, lastUsedAt: null };
      queryClient.setQueryData(API_TOKEN_QUERY_KEY, info);
    },
  });
}

export function useRevokeApiToken() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await request("DELETE", getToken, "Couldn't revoke token");
    },
    onSuccess: () => {
      queryClient.setQueryData(API_TOKEN_QUERY_KEY, null);
    },
  });
}

import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation } from "@tanstack/react-query";
import { API_URL } from "@/lib/config";
import type { FeedbackRequest, FeedbackResponse } from "@/lib/feedback";
import { apiErrorFrom } from "@/lib/toast";

async function sendFeedback(
  body: FeedbackRequest,
  getToken: () => Promise<string | null>,
): Promise<FeedbackResponse> {
  const token = await getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(`${API_URL}/feedback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await apiErrorFrom(response);
  return response.json();
}

/** `POST /feedback`: file an issue in the private inbox. Admins only. */
export function useSendFeedback() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: (body: FeedbackRequest) => sendFeedback(body, getToken),
  });
}

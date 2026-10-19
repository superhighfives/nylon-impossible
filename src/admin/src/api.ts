const API_BASE = import.meta.env.VITE_API_BASE_URL;

export interface AdminUserListItem {
  id: string;
  email: string;
  todoCount: number;
  createdAt: string;
}

export interface ListUsersResponse {
  users: AdminUserListItem[];
  nextCursor: string | null;
}

async function request<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.error ?? "";
    } catch {
      // body wasn't JSON; fall through
    }
    throw new Error(
      `${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`,
    );
  }
  return (await res.json()) as T;
}

export function listUsers(token: string, cursor: string | null) {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<ListUsersResponse>(token, `/admin/users${qs}`);
}

export function deleteUser(token: string, id: string) {
  return request<{ id: string; deleted: true }>(token, `/admin/users/${id}`, {
    method: "DELETE",
  });
}

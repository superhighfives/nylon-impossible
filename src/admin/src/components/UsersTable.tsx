import { useEffect, useState } from "react";
import { useToken } from "../App";
import { type AdminUserListItem, deleteUser, listUsers } from "../api";

export function UsersTable() {
  const token = useToken();
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listUsers(token, cursor)
      .then((res) => {
        if (cancelled) return;
        setUsers((prev) => (cursor ? [...prev, ...res.users] : res.users));
        setNextCursor(res.nextCursor);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, cursor]);

  async function handleDelete(user: AdminUserListItem) {
    if (!token) return;
    const confirmed = window.confirm(
      `Delete ${user.email}? This removes all of their todos and lists, and the Clerk account. This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeletingId(user.id);
    setError(null);
    try {
      await deleteUser(token, user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  if (!token) return <div className="text-neutral-500">Loading session…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Users</h2>
        <span className="text-sm text-neutral-500">{users.length} shown</span>
      </div>
      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <table className="w-full overflow-hidden rounded border border-neutral-200 bg-white text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
          <tr>
            <th className="px-3 py-2">Email</th>
            <th className="px-3 py-2 text-right">Todos</th>
            <th className="px-3 py-2">Created</th>
            <th className="px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-neutral-100">
              <td className="px-3 py-2">
                <div className="font-medium">{u.email}</div>
                <div className="font-mono text-xs text-neutral-500">{u.id}</div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {u.todoCount}
              </td>
              <td className="px-3 py-2 text-neutral-600">
                {new Date(u.createdAt).toLocaleDateString()}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => handleDelete(u)}
                  disabled={deletingId !== null}
                  className="rounded border border-red-300 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {deletingId === u.id ? "Deleting…" : "Delete"}
                </button>
              </td>
            </tr>
          ))}
          {users.length === 0 && !loading && (
            <tr>
              <td
                colSpan={4}
                className="px-3 py-8 text-center text-neutral-500"
              >
                No users yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {loading && <div className="text-sm text-neutral-500">Loading…</div>}
      {nextCursor && !loading && (
        <button
          type="button"
          onClick={() => setCursor(nextCursor)}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Load more
        </button>
      )}
    </div>
  );
}

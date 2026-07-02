import { useEffect, useState } from "react";
import { useToken } from "../App";
import { type AdminUserListItem, listUsers } from "../api";

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function UsersTable({ selectedId, onSelect }: Props) {
  const token = useToken();
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
            <th className="px-3 py-2">Plan</th>
            <th className="px-3 py-2 text-right">Todos</th>
            <th className="px-3 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr
              key={u.id}
              onClick={() => onSelect(u.id)}
              className={`cursor-pointer border-t border-neutral-100 hover:bg-neutral-50 ${
                selectedId === u.id ? "bg-blue-50" : ""
              }`}
            >
              <td className="px-3 py-2 font-medium">{u.email}</td>
              <td className="px-3 py-2">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    u.plan === "pro"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-neutral-100 text-neutral-700"
                  }`}
                >
                  {u.plan}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {u.todoCount}
              </td>
              <td className="px-3 py-2 text-neutral-600">
                {new Date(u.createdAt).toLocaleDateString()}
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

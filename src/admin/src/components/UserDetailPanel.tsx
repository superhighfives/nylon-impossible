import { useEffect, useState } from "react";
import { useToken } from "../App";
import {
  type AdminUserDetail,
  deleteUser,
  getUser,
  updateUserPlan,
} from "../api";

interface Props {
  userId: string;
  onClose: () => void;
  onDeleted: () => void;
}

export function UserDetailPanel({ userId, onClose, onDeleted }: Props) {
  const token = useToken();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setError(null);
    getUser(token, userId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  async function togglePlan() {
    if (!token || !detail) return;
    const next = detail.plan === "pro" ? "free" : "pro";
    setBusy(true);
    try {
      await updateUserPlan(token, userId, next);
      setDetail({ ...detail, plan: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!token || !detail) return;
    const confirmed = window.confirm(
      `Delete ${detail.email}? This removes all of their todos, messages, and the Clerk account. This cannot be undone.`,
    );
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteUser(token, userId);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (!token) return <div className="p-6 text-neutral-500">Loading…</div>;
  if (error) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={onClose}
          className="mb-4 text-sm text-neutral-500 hover:text-neutral-900"
        >
          ← Close
        </button>
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }
  if (!detail) return <div className="p-6 text-neutral-500">Loading…</div>;

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-neutral-500 hover:text-neutral-900"
        >
          ← Close
        </button>
      </div>

      <h2 className="text-lg font-semibold break-words">{detail.email}</h2>
      <p className="font-mono text-xs text-neutral-500">{detail.id}</p>

      <dl className="mt-6 space-y-3 text-sm">
        <Row label="Plan">
          <div className="flex items-center gap-2">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                detail.plan === "pro"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {detail.plan}
            </span>
            <button
              type="button"
              onClick={togglePlan}
              disabled={busy}
              className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs hover:bg-neutral-50 disabled:opacity-50"
            >
              Make {detail.plan === "pro" ? "free" : "pro"}
            </button>
          </div>
        </Row>
        <Row label="AI enabled">{detail.aiEnabled ? "Yes" : "No"}</Row>
        <Row label="Location">{detail.location ?? "—"}</Row>
        <Row label="Created">{new Date(detail.createdAt).toLocaleString()}</Row>
        <Row label="Updated">{new Date(detail.updatedAt).toLocaleString()}</Row>
      </dl>

      <h3 className="mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Diagnostics
      </h3>
      <dl className="mt-3 space-y-3 text-sm">
        <Row label="Todos">{detail.diagnostics.todoCount}</Row>
        <Row label="Messages">{detail.diagnostics.messageCount}</Row>
        <Row label="Research runs">{detail.diagnostics.researchCount}</Row>
        <Row label="Last todo update">
          {detail.diagnostics.lastTodoUpdatedAt
            ? new Date(detail.diagnostics.lastTodoUpdatedAt).toLocaleString()
            : "—"}
        </Row>
      </dl>

      <div className="mt-10 border-t border-neutral-200 pt-6">
        <h3 className="text-sm font-semibold text-red-700">Danger zone</h3>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="mt-3 w-full rounded border border-red-300 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Delete user (cascade DB + Clerk)
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

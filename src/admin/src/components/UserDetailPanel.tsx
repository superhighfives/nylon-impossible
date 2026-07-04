import { useEffect, useState } from "react";
import { useToken } from "../App";
import { type AdminUserDetail, deleteUser, getUser, updateUser } from "../api";

interface Props {
  userId: string;
  onClose: () => void;
  onDeleted: () => void;
}

interface EditForm {
  plan: "free" | "pro";
  aiEnabled: boolean;
  location: string;
}

export function UserDetailPanel({ userId, onClose, onDeleted }: Props) {
  const token = useToken();
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({
    plan: "free",
    aiEnabled: false,
    location: "",
  });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setError(null);
    setEditing(false);
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

  function startEdit() {
    if (!detail) return;
    setForm({
      plan: detail.plan,
      aiEnabled: detail.aiEnabled,
      location: detail.location ?? "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (!token || !detail) return;
    setBusy(true);
    setError(null);
    try {
      const location =
        form.location.trim() === "" ? null : form.location.trim();
      const updated = await updateUser(token, userId, {
        plan: form.plan,
        aiEnabled: form.aiEnabled,
        location,
      });
      setDetail({
        ...detail,
        plan: updated.plan,
        aiEnabled: updated.aiEnabled,
        location: updated.location,
        updatedAt: updated.updatedAt,
      });
      setEditing(false);
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

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold break-words">{detail.email}</h2>
          <p className="font-mono text-xs text-neutral-500">{detail.id}</p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="shrink-0 rounded border border-neutral-300 bg-white px-2 py-1 text-xs hover:bg-neutral-50"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-6 space-y-4 text-sm">
          <label className="flex items-center justify-between gap-4">
            <span className="text-neutral-500">Plan</span>
            <select
              value={form.plan}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  plan: e.target.value as "free" | "pro",
                }))
              }
              className="rounded border border-neutral-300 bg-white px-2 py-1"
            >
              <option value="free">free</option>
              <option value="pro">pro</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-neutral-500">AI enabled</span>
            <input
              type="checkbox"
              checked={form.aiEnabled}
              onChange={(e) =>
                setForm((f) => ({ ...f, aiEnabled: e.target.checked }))
              }
              className="h-4 w-4"
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-neutral-500">Location</span>
            <input
              type="text"
              value={form.location}
              onChange={(e) =>
                setForm((f) => ({ ...f, location: e.target.value }))
              }
              placeholder="—"
              className="w-48 rounded border border-neutral-300 bg-white px-2 py-1 text-right"
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={busy}
              className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs hover:bg-neutral-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveEdit}
              disabled={busy}
              className="rounded border border-neutral-900 bg-neutral-900 px-3 py-1 text-xs text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <dl className="mt-6 space-y-3 text-sm">
          <Row label="Plan">
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                detail.plan === "pro"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {detail.plan}
            </span>
          </Row>
          <Row label="AI enabled">{detail.aiEnabled ? "Yes" : "No"}</Row>
          <Row label="Location">{detail.location ?? "—"}</Row>
          <Row label="Created">
            {new Date(detail.createdAt).toLocaleString()}
          </Row>
          <Row label="Updated">
            {new Date(detail.updatedAt).toLocaleString()}
          </Row>
        </dl>
      )}

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

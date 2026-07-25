import { Show, SignInButton } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { connectGmailAddon } from "@/server/gmail-addon";

export const Route = createFileRoute("/connect/gmail-addon")({
  component: ConnectGmailAddonPage,
  head: () => ({ meta: [{ title: "Connect Nylon to Gmail" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    state: typeof search.state === "string" ? search.state : "",
  }),
});

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="container max-w-md mx-auto py-16 px-4">
      <div className="rounded-2xl border border-gray-subtle bg-gray-1 dark:bg-graydark-2 p-6 space-y-3 text-center">
        <img
          src="/logo192.png"
          alt="Nylon Impossible"
          className="size-10 mx-auto"
        />
        {children}
      </div>
    </div>
  );
}

function ConnectGmailAddonPage() {
  const { state } = Route.useSearch();

  return (
    <>
      <Show when="signed-out">
        <Panel>
          <h1 className="text-lg font-semibold">Connect Nylon to Gmail</h1>
          <p className="text-gray-dim text-sm">
            Sign in to your Nylon account to finish connecting the Gmail add-on.
          </p>
          <SignInButton mode="modal">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full bg-gray-12 text-gray-1 px-4 py-2 text-sm font-medium"
            >
              Sign in
            </button>
          </SignInButton>
        </Panel>
      </Show>

      <Show when="signed-in">
        <ConnectRunner state={state} />
      </Show>
    </>
  );
}

type Status = "connecting" | "connected" | "error" | "missing";

function ConnectRunner({ state }: { state: string }) {
  const [status, setStatus] = useState<Status>(
    state ? "connecting" : "missing",
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    let cancelled = false;
    connectGmailAddon({ data: state })
      .then(() => {
        if (!cancelled) setStatus("connected");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Something went wrong connecting your account.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (status === "missing") {
    return (
      <Panel>
        <h1 className="text-lg font-semibold">Nothing to connect</h1>
        <p className="text-gray-dim text-sm">
          Open the Nylon panel in Gmail and tap “Connect Nylon” to start.
        </p>
      </Panel>
    );
  }

  if (status === "connecting") {
    return (
      <Panel>
        <h1 className="text-lg font-semibold">Connecting…</h1>
        <p className="text-gray-dim text-sm">Linking your Gmail add-on.</p>
      </Panel>
    );
  }

  if (status === "error") {
    return (
      <Panel>
        <h1 className="text-lg font-semibold">Couldn’t connect</h1>
        <p className="text-gray-dim text-sm">
          {message ?? "Something went wrong. Reopen the panel in Gmail."}
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <h1 className="text-lg font-semibold">Connected</h1>
      <p className="text-gray-dim text-sm">
        Your Gmail add-on is linked to Nylon. Head back to Gmail and reopen the
        panel to start adding todos.
      </p>
    </Panel>
  );
}

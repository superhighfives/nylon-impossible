import {
  SignedIn,
  SignedOut,
  SignIn,
  UserButton,
  useAuth,
  useUser,
} from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { UserDetailPanel } from "./components/UserDetailPanel";
import { UsersTable } from "./components/UsersTable";

export function App() {
  return (
    <>
      <SignedOut>
        <div className="flex h-full items-center justify-center bg-neutral-50">
          <SignIn routing="hash" />
        </div>
      </SignedOut>
      <SignedIn>
        <AdminShell />
      </SignedIn>
    </>
  );
}

function AdminShell() {
  const { user } = useUser();
  const role = (user?.publicMetadata as { role?: string } | undefined)?.role;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (role !== "admin") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-50 p-8 text-center">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="text-neutral-600 max-w-md">
          Your account does not have the <code>admin</code> role. Ask another
          admin to set <code>publicMetadata.role = "admin"</code> on your Clerk
          user.
        </p>
        <div className="mt-4">
          <UserButton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">Nylon Admin</h1>
        <UserButton />
      </header>
      <main className="flex flex-1 overflow-hidden">
        <section className="flex-1 overflow-auto p-6">
          <UsersTable
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
          />
        </section>
        {selectedId && (
          <aside className="w-[420px] overflow-auto border-l border-neutral-200 bg-white">
            <UserDetailPanel
              key={selectedId}
              userId={selectedId}
              onClose={() => setSelectedId(null)}
              onDeleted={() => setSelectedId(null)}
            />
          </aside>
        )}
      </main>
    </div>
  );
}

export function useToken() {
  const { getToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getToken().then((t) => {
      if (!cancelled) setToken(t);
    });
    return () => {
      cancelled = true;
    };
  }, [getToken]);
  return token;
}

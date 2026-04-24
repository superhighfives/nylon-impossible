import { useUpdateUser, useUser } from "@/hooks/useUser";

export function AiToggle() {
  const { data: user, isLoading } = useUser();
  const updateUser = useUpdateUser();

  if (isLoading || !user) {
    return null;
  }

  const handleToggle = () => {
    updateUser.mutate({ aiEnabled: !user.aiEnabled });
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        type="button"
        role="switch"
        aria-checked={user.aiEnabled}
        aria-label={
          user.aiEnabled ? "Disable AI features" : "Enable AI features"
        }
        onClick={handleToggle}
        disabled={updateUser.isPending}
        className="flex items-center gap-2 rounded-lg bg-gray-surface/90 px-3 py-2 text-xs font-mono backdrop-blur-sm transition-colors hover:bg-gray-base/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-strong"
        title={user.aiEnabled ? "AI is enabled" : "AI is disabled"}
      >
        <span className="text-gray-muted">ai</span>
        <span
          className={`inline-flex h-4 w-7 items-center rounded-full transition-colors ${
            user.aiEnabled ? "bg-yellow-solid" : "bg-gray-base"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-gray-12 shadow-sm transition-transform ${
              user.aiEnabled ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </span>
        <span className={user.aiEnabled ? "text-gray" : "text-gray-muted"}>
          {user.aiEnabled ? "on" : "off"}
        </span>
      </button>
    </div>
  );
}

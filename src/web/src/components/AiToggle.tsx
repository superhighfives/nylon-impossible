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
    <button
      type="button"
      role="switch"
      aria-checked={user.aiEnabled}
      aria-label={user.aiEnabled ? "Disable AI features" : "Enable AI features"}
      onClick={handleToggle}
      disabled={updateUser.isPending}
      className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-gray-muted hover:text-gray transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-strong focus-visible:ring-offset-2"
      title={user.aiEnabled ? "AI is enabled" : "AI is disabled"}
    >
      <span
        className={`inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          user.aiEnabled ? "bg-yellow-solid" : "bg-gray-base"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            user.aiEnabled ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
      <span>AI</span>
    </button>
  );
}

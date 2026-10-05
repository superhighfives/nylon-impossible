import { Dialog } from "@base-ui/react/dialog";
import { useClerk } from "@clerk/tanstack-react-start";
import { useLocation } from "@tanstack/react-router";
import { Monitor, Moon, Settings, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSettings } from "@/hooks/useSettings";
import {
  type Theme,
  useDeleteCurrentUser,
  useUpdateUser,
  useUser,
} from "@/hooks/useUser";
import { messageFromError, toast } from "@/lib/toast";
import {
  DevEnvironmentDetails,
  useDevEnvironment,
} from "./DevEnvironmentIndicator";
import { Button, LayerCard, Loader, Select } from "./ui";

// Full IANA timezone list from the runtime — avoids hand-maintaining a
// curated subset, and every value round-trips through Intl.DateTimeFormat
// the aging sweep already relies on.
const TIMEZONE_ITEMS = (
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : ["UTC"]
).map((tz) => ({ value: tz, label: tz.replace(/_/g, " ") }));

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function SettingsModal({ origin }: { origin: string }) {
  const { data: user, isLoading: isLoadingUser } = useUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteCurrentUser();
  const { signOut } = useClerk();
  // Open state is shared so the nav dropdown (mobile) and the floating button
  // (desktop) can both drive the same modal.
  const { isOpen: open, setOpen } = useSettings();
  const { isOnline } = useOnlineStatus();
  // Non-null only in local dev and preview deploys; gates the Environment card
  // so production renders nothing (and no empty heading).
  const devEnv = useDevEnvironment(origin);
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const [timezone, setTimezone] = useState("UTC");

  const handleDeleteAccount = () => {
    const confirmed = window.confirm(
      "Permanently delete your account? All of your todos, lists, and conversation history will be removed and cannot be recovered.",
    );
    if (!confirmed) return;
    deleteUser.mutate(undefined, {
      onSuccess: async () => {
        setOpen(false);
        await signOut({ redirectUrl: "/" });
      },
      onError: (err) => {
        toast.error(messageFromError(err, "Couldn't delete your account"));
      },
    });
  };

  // Sync local state when user data loads or modal opens
  useEffect(() => {
    if (user && open) {
      // "UTC" is the migration/creation default, not a deliberate choice —
      // default to the browser's detected zone the first time settings are
      // opened rather than leaving a new user stuck on UTC.
      setTimezone(
        user.timezone === "UTC"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : user.timezone,
      );
    }
  }, [user, open]);

  const handleSave = () => {
    updateUser.mutate(
      { timezone },
      {
        onSuccess: () => setOpen(false),
        onError: (err) => {
          toast.error(messageFromError(err, "Couldn't save settings"));
        },
      },
    );
  };

  const hasChanges = user !== undefined && timezone !== user?.timezone;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {/* Desktop opens from this floating button; on mobile it's opened from
          the nav dropdown instead, so the button is hidden there. The signed-in
          board ("/") draws its own Settings button in BoardChrome's top-right
          corner, so the trigger hides there too. */}
      {pathname !== "/" && (
        <div
          className={`fixed ${isOnline === false ? "top-12" : "top-4"} right-4 z-50 hidden sm:block transition-[top] duration-200`}
        >
          <Dialog.Trigger
            render={
              <Button
                variant="outline"
                size="sm"
                ringOffset="app"
                aria-label="Settings"
              >
                <Settings size={16} />
                Settings
              </Button>
            }
          />
        </div>
      )}
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-70" />
        <Dialog.Popup className="fixed inset-0 z-80 flex items-center justify-center p-4">
          <div className="w-full max-w-xl max-h-[calc(100dvh-2rem)] overflow-y-auto bg-gray-surface rounded-xl shadow-lg p-6 space-y-4">
            <Dialog.Title className="text-lg font-semibold text-gray">
              Settings
            </Dialog.Title>
            {isLoadingUser ? (
              <div
                className="flex items-center gap-2 text-sm text-gray-muted py-2"
                aria-live="polite"
              >
                <Loader size="sm" />
                <span>Loading settings…</span>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <LayerCard>
                  <LayerCard.Secondary>Appearance</LayerCard.Secondary>
                  <LayerCard.Primary>
                    <div className="inline-flex self-start rounded-lg bg-gray-base p-0.5">
                      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
                        const selected = (user?.theme ?? "system") === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={selected}
                            disabled={updateUser.isPending}
                            onClick={() => {
                              if (selected) return;
                              // Applies live via the optimistic cache update, which
                              // ThemeSync watches — no Save needed.
                              updateUser.mutate(
                                { theme: value },
                                {
                                  onError: (err) =>
                                    toast.error(
                                      messageFromError(
                                        err,
                                        "Couldn't change theme",
                                      ),
                                    ),
                                },
                              );
                            }}
                            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-inset disabled:opacity-50 ${
                              selected
                                ? "bg-gray-surface text-gray shadow-sm"
                                : "text-gray-muted hover:text-gray"
                            }`}
                          >
                            <Icon size={13} />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-muted">
                      System follows your device's light or dark setting.
                    </p>
                  </LayerCard.Primary>
                </LayerCard>
                <LayerCard>
                  <LayerCard.Secondary>Timezone</LayerCard.Secondary>
                  <LayerCard.Primary>
                    <Select
                      items={TIMEZONE_ITEMS}
                      value={timezone}
                      onValueChange={(value) => setTimezone(value as string)}
                      disabled={updateUser.isPending}
                      size="sm"
                    />
                    <p className="text-xs text-gray-muted">
                      Drives when Today's todos age into This Week, and This
                      Week into Sometime — always at your local midnight.
                    </p>
                  </LayerCard.Primary>
                </LayerCard>
                <LayerCard>
                  <LayerCard.Secondary className="text-red">
                    Danger zone
                  </LayerCard.Secondary>
                  <LayerCard.Primary>
                    <p className="text-xs text-gray-muted">
                      Permanently delete your account and all of your data. This
                      cannot be undone.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDeleteAccount}
                      disabled={deleteUser.isPending || updateUser.isPending}
                      loading={deleteUser.isPending}
                      className="self-start text-red border-red-base hover:bg-red-base"
                    >
                      Delete my account
                    </Button>
                  </LayerCard.Primary>
                </LayerCard>
                {/* Local dev and preview deploys only — gated by devEnv so
                    production renders nothing (no empty card). Replaces the
                    floating desktop indicator that used to sit bottom-left. */}
                {devEnv && (
                  <LayerCard className="sm:col-span-2">
                    <LayerCard.Secondary>Environment</LayerCard.Secondary>
                    <LayerCard.Primary>
                      <div className="flex flex-col gap-1 text-xs font-mono text-gray-muted">
                        <DevEnvironmentDetails origin={origin} />
                      </div>
                    </LayerCard.Primary>
                  </LayerCard>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close
                render={
                  <Button variant="ghost" disabled={updateUser.isPending}>
                    Done
                  </Button>
                }
              />
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={!hasChanges || updateUser.isPending}
                loading={updateUser.isPending}
              >
                Save
              </Button>
            </div>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

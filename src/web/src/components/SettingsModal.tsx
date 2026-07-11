import { Dialog } from "@base-ui/react/dialog";
import { useClerk, useUser as useClerkUser } from "@clerk/tanstack-react-start";
import { MapPin, Monitor, Moon, Settings, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useImportReview } from "@/hooks/useImportReview";
import { useImportGoogleTasks } from "@/hooks/useTodos";
import {
  type Theme,
  useDeleteCurrentUser,
  useUpdateUser,
  useUser,
} from "@/hooks/useUser";
import { messageFromError, toast } from "@/lib/toast";
import { Button, Field, Input, Loader } from "./ui";

// Full Google scope required to read Tasks. Google rejects the shorthand
// (`tasks.readonly`) with invalid_scope, so the fully-qualified URL is used
// both here and in the Clerk connection's additional scopes.
const GOOGLE_TASKS_SCOPE = "https://www.googleapis.com/auth/tasks.readonly";

const NominatimSchema = z.object({
  address: z
    .object({
      city: z.string().optional(),
      town: z.string().optional(),
      village: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function SettingsModal() {
  const { data: user, isLoading: isLoadingUser } = useUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteCurrentUser();
  const importGoogleTasks = useImportGoogleTasks();
  const { startReview } = useImportReview();
  const { user: clerkUser, isLoaded: isClerkLoaded } = useClerkUser();
  const { signOut } = useClerk();
  const [location, setLocation] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);

  // A Google account is only usable for import once it's connected *and* has
  // granted the Tasks scope — a plain sign-in connection won't have it.
  const googleAccount = clerkUser?.externalAccounts.find(
    (account) => account.provider === "google",
  );
  const googleTasksReady = Boolean(
    googleAccount?.approvedScopes?.includes(GOOGLE_TASKS_SCOPE),
  );

  const handleConnectGoogle = async () => {
    if (!clerkUser) return;
    setIsConnectingGoogle(true);
    try {
      const externalAccount = await clerkUser.createExternalAccount({
        strategy: "oauth_google",
        redirectUrl: window.location.href,
        additionalScopes: [GOOGLE_TASKS_SCOPE],
      });
      const redirect =
        externalAccount.verification?.externalVerificationRedirectURL;
      if (redirect) {
        window.location.href = redirect.toString();
        return; // navigating away; keep the spinner until unload
      }
      setIsConnectingGoogle(false);
      toast.error("Couldn't start the Google connection");
    } catch (err) {
      setIsConnectingGoogle(false);
      toast.error(messageFromError(err, "Couldn't connect Google"));
    }
  };

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
      setLocation(user.location ?? "");
      setAiEnabled(user.aiEnabled);
    }
  }, [user, open]);

  const handleSave = () => {
    const trimmedLocation = location.trim();
    updateUser.mutate(
      { location: trimmedLocation || null, aiEnabled },
      {
        onSuccess: () => setOpen(false),
        onError: (err) => {
          toast.error(messageFromError(err, "Couldn't save settings"));
        },
      },
    );
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Location isn't available in this browser");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,
            { headers: { "Accept-Language": "en" } },
          );
          const data = NominatimSchema.parse(await res.json());
          const { city, town, village, state, country } = data.address ?? {};
          const place = city || town || village || "";
          const region = state || country || "";
          const label = [place, region].filter(Boolean).join(", ");
          if (label) {
            setLocation(label);
          } else {
            toast.error("Couldn't figure out your location");
          }
        } catch (err) {
          toast.error(messageFromError(err, "Couldn't look up your location"));
        }
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        toast.error("Couldn't access your location");
      },
    );
  };

  const hasChanges =
    location.trim() !== (user?.location ?? "") || aiEnabled !== user?.aiEnabled;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="fixed bottom-4 right-4 z-50">
        <Dialog.Trigger
          render={
            <Button variant="outline" size="sm" aria-label="Settings">
              <Settings size={16} />
              Settings
            </Button>
          }
        />
      </div>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-70" />
        <Dialog.Popup className="fixed inset-0 z-80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-gray-surface rounded-xl shadow-lg p-6 space-y-4">
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
              <>
                {/* Location only feeds AI location research, so it's a
                    Pro-only setting alongside the AI toggle below. */}
                {user?.plan === "pro" && (
                  <Field
                    label="Your location"
                    description="Used to find local venues when researching location todos."
                  >
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. Los Angeles, CA"
                      disabled={updateUser.isPending || isLocating}
                    />
                    <button
                      type="button"
                      onClick={handleUseCurrentLocation}
                      disabled={updateUser.isPending || isLocating}
                      className="flex items-center gap-1.5 text-xs text-gray-muted hover:text-gray transition-colors disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <MapPin size={12} />
                      {isLocating ? "Locating…" : "Use current location"}
                    </button>
                  </Field>
                )}
                <Field
                  label="Appearance"
                  description="System follows your device's light or dark setting."
                >
                  <div className="inline-flex rounded-lg bg-gray-base p-0.5">
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
                          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-strong disabled:opacity-50 ${
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
                </Field>
                {/* AI is a paid feature, so the toggle only appears for pro
                    users. Free users' aiEnabled is ignored server-side. */}
                {user?.plan === "pro" && (
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <span className="text-sm font-medium text-gray">
                        AI features
                      </span>
                      <p className="text-xs text-gray-muted">
                        When enabled, AI helps enrich todos by doing research
                        tasks, pulling out metadata, and finding locations.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={aiEnabled}
                      aria-label={
                        aiEnabled ? "Disable AI features" : "Enable AI features"
                      }
                      onClick={() => setAiEnabled(!aiEnabled)}
                      disabled={updateUser.isPending}
                      // The visual track stays 16×28px; a -inset-3 pseudo-element
                      // extends the clickable area to ~40×52px for an accessible
                      // touch target without changing the design.
                      className={`relative shrink-0 inline-flex h-4 w-7 items-center rounded-full transition-colors before:absolute before:-inset-3 before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-strong disabled:opacity-50 ${aiEnabled ? "bg-yellow-solid" : "bg-gray-base"}`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-gray-12 shadow-sm transition-transform ${aiEnabled ? "translate-x-3.5" : "translate-x-0.5"}`}
                      />
                    </button>
                  </div>
                )}
                <div className="border-t border-gray-base pt-4 mt-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-muted mb-2">
                    Import
                  </h3>
                  {!isClerkLoaded ? (
                    <div
                      className="flex items-center gap-2 text-xs text-gray-muted py-1"
                      aria-live="polite"
                    >
                      <Loader size="sm" />
                      <span>Checking Google connection…</span>
                    </div>
                  ) : googleTasksReady ? (
                    <>
                      <p className="text-xs text-gray-muted mb-3">
                        Bring across open tasks from your Google Tasks “My
                        Tasks” list, with due dates and link research. Google
                        doesn't share repeat schedules, so we'll help you set
                        those afterwards. We only import open tasks, so a
                        repeating to-do you've already completed in Google today
                        won't come across — re-import once its next occurrence
                        is due. Already-imported tasks are skipped, so it's safe
                        to run again.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          importGoogleTasks.mutate(undefined, {
                            onSuccess: ({
                              imported,
                              importedIds,
                              datedTodos,
                            }) => {
                              if (!importedIds?.length) return;
                              // Step out of Settings and into the focused
                              // repeat-schedule review for the new dated tasks.
                              setOpen(false);
                              startReview({
                                importedIds,
                                datedTodos,
                                imported,
                              });
                            },
                          })
                        }
                        disabled={importGoogleTasks.isPending}
                        loading={importGoogleTasks.isPending}
                      >
                        Import from Google Tasks
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-gray-muted mb-3">
                        Connect your Google account to import open tasks from
                        Google Tasks. We only request read-only access to your
                        tasks.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleConnectGoogle}
                        disabled={isConnectingGoogle}
                        loading={isConnectingGoogle}
                      >
                        {googleAccount
                          ? "Reconnect Google for Tasks"
                          : "Connect Google"}
                      </Button>
                    </>
                  )}
                </div>
                <div className="border-t border-gray-base pt-4 mt-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-red mb-2">
                    Danger zone
                  </h3>
                  <p className="text-xs text-gray-muted mb-3">
                    Permanently delete your account and all of your data. This
                    cannot be undone.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteAccount}
                    disabled={deleteUser.isPending || updateUser.isPending}
                    loading={deleteUser.isPending}
                    className="text-red border-red-base hover:bg-red-base"
                  >
                    Delete my account
                  </Button>
                </div>
              </>
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

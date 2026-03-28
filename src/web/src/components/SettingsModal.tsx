import { Dialog } from "@base-ui/react/dialog";
import { MapPin, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useUpdateUser, useUser } from "@/hooks/useUser";
import { Button, Field, Input } from "./ui";

export function SettingsModal() {
  const { data: user, isLoading: isLoadingUser } = useUser();
  const updateUser = useUpdateUser();
  const [location, setLocation] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

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
      },
    );
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,
            { headers: { "Accept-Language": "en" } },
          );
          const data = await res.json();
          const { city, town, village, state, country } = data.address ?? {};
          const place = city || town || village || "";
          const region = state || country || "";
          setLocation([place, region].filter(Boolean).join(", "));
        } catch {
          // silently fail
        }
        setIsLocating(false);
      },
      () => setIsLocating(false),
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
              <p className="text-sm text-gray-muted">Loading...</p>
            ) : (
              <>
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
                    className={`shrink-0 inline-flex h-4 w-7 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-strong disabled:opacity-50 ${aiEnabled ? "bg-yellow-solid" : "bg-gray-base"}`}
                  >
                    <span
                      className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${aiEnabled ? "translate-x-3.5" : "translate-x-0.5"}`}
                    />
                  </button>
                </div>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Dialog.Close
                render={
                  <Button variant="ghost" disabled={updateUser.isPending}>
                    Cancel
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

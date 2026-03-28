import { Dialog } from "@base-ui/react/dialog";
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useUpdateUser, useUser } from "@/hooks/useUser";
import { Button, Field, Input } from "./ui";

export function SettingsModal() {
  const { data: user, isLoading: isLoadingUser } = useUser();
  const updateUser = useUpdateUser();
  const [location, setLocation] = useState("");
  const [open, setOpen] = useState(false);

  // Sync local state when user data loads or modal opens
  useEffect(() => {
    if (user && open) {
      setLocation(user.location ?? "");
    }
  }, [user, open]);

  const handleSave = () => {
    const trimmedLocation = location.trim();
    updateUser.mutate(
      { location: trimmedLocation || null },
      {
        onSuccess: () => setOpen(false),
      },
    );
  };

  const hasChanges = location.trim() !== (user?.location ?? "");

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            aria-label="Settings"
          >
            <Settings size={16} />
          </Button>
        }
      />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/40 z-[70]" />
        <Dialog.Popup className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-gray-surface rounded-xl shadow-lg p-6 space-y-4">
            <Dialog.Title className="text-lg font-semibold text-gray">
              Settings
            </Dialog.Title>
            {isLoadingUser ? (
              <p className="text-sm text-gray-muted">Loading...</p>
            ) : (
              <Field
                label="Your location"
                description="Used to find local venues when researching location todos."
              >
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Los Angeles, CA"
                  disabled={updateUser.isPending}
                />
              </Field>
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

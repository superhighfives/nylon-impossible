import { Dialog } from "@base-ui/react/dialog";
import { useClerk, useUser as useClerkUser } from "@clerk/tanstack-react-start";
import { useRef } from "react";
import { moveMenuFocus } from "./ContextMenu";

/** Initials for the avatar fallback: "Charlie Gleason" → "CG". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** The signed-in user's Clerk avatar, with initials while it loads. */
export function Avatar({ size }: { size: number }) {
  const { user } = useClerkUser();
  const name = user?.fullName ?? user?.primaryEmailAddress?.emailAddress;
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-n-fill text-xs font-semibold text-n-ink"
    >
      {user?.hasImage ? (
        <img src={user.imageUrl} alt="" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

const ITEM =
  "mt-1.5 flex h-[3.25rem] w-full cursor-pointer items-center rounded-[0.875rem] bg-n-surface px-3.5 text-left text-base font-medium text-n-ink n-focus-inset dark:bg-n-fill";

/**
 * The avatar menu: Done history, Settings, Send feedback (admins only) and
 * Sign out, as a bottom sheet.
 */
export function AccountSheet({
  open,
  onClose,
  doneCount,
  onDone,
  onOpen,
  onSettings,
  onFeedback,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  doneCount: number;
  onDone: () => void;
  onSettings: () => void;
  /** Shown only when set — the caller passes it for admins. */
  onFeedback?: () => void;
}) {
  const { user } = useClerkUser();
  const { signOut } = useClerk();
  const first = useRef<HTMLButtonElement>(null);
  const email = user?.primaryEmailAddress?.emailAddress;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => (next ? onOpen() : onClose())}
    >
      <Dialog.Trigger
        aria-label="Account"
        className="-mr-1.5 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full n-focus"
      >
        <Avatar size={30} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[color-mix(in_srgb,black_28%,transparent)] transition-opacity duration-(--n-duration-base) data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-[color-mix(in_srgb,black_55%,transparent)]" />
        <Dialog.Popup
          initialFocus={first}
          className="fixed inset-x-2.5 bottom-[calc(0.625rem+env(safe-area-inset-bottom,0px))] z-50 mx-auto max-w-md rounded-[1.625rem] bg-n-canvas p-2 text-n-ink shadow-[0_10px_40px_color-mix(in_srgb,black_18%,transparent)] outline-none transition-[translate,opacity] duration-(--n-duration-base) ease-n-out data-ending-style:translate-y-6 data-ending-style:opacity-0 data-starting-style:translate-y-6 data-starting-style:opacity-0 dark:bg-n-surface"
        >
          <div className="flex items-center gap-3 px-3 pt-3 pb-3.5">
            <Avatar size={40} />
            <div className="min-w-0">
              <Dialog.Title className="truncate text-base font-semibold">
                {user?.fullName ?? email ?? "Account"}
              </Dialog.Title>
              <Dialog.Description className="truncate text-[0.8125rem] text-n-ink-muted">
                {user?.fullName && email ? email : "Signed in"}
              </Dialog.Description>
            </div>
          </div>
          <div role="menu" aria-label="Account" onKeyDown={moveMenuFocus}>
            <button
              ref={first}
              type="button"
              role="menuitem"
              onClick={onDone}
              aria-describedby="account-done-count"
              className={ITEM}
            >
              Done
              <span
                aria-hidden="true"
                className="ml-auto font-normal text-n-ink-muted tabular-nums"
              >
                {doneCount}
              </span>
              <span id="account-done-count" hidden>
                {doneCount} {doneCount === 1 ? "todo" : "todos"}
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={onSettings}
              className={ITEM}
            >
              Settings
            </button>
            {onFeedback && (
              <button
                type="button"
                role="menuitem"
                onClick={onFeedback}
                className={ITEM}
              >
                Send feedback
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => signOut({ redirectUrl: "/" })}
              className={ITEM}
            >
              Sign out
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

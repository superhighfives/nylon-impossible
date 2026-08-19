import { UserButton } from "@clerk/tanstack-react-start";
import { Settings } from "lucide-react";
import type { Ref } from "react";
import { TodoInput } from "@/components/TodoInput";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSettings } from "@/hooks/useSettings";
import { Button } from "./ui";

/**
 * Fixed chrome for the signed-in board: the brand logo mark and quick-add
 * composer top-left, Settings/account top-right, floating above the
 * full-bleed column grid. Replaces the floating pill header (which
 * Header.tsx suppresses on "/").
 */
export function BoardChrome({
  composerRef,
}: {
  /** Lets the board's global `n` shortcut focus the composer. */
  composerRef?: Ref<HTMLTextAreaElement>;
}) {
  const { isOnline } = useOnlineStatus();
  const { open: openSettings } = useSettings();
  // Mobile reaches Settings through the account menu (added below); the
  // standalone button would crowd the logotype on narrow screens.
  const isMobile = useIsMobile();
  const topClass = isOnline === false ? "top-14" : "top-5";

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-40 flex items-center justify-between px-4 transition-[top] duration-200 sm:px-6 lg:px-8 ${topClass}`}
    >
      <div className="pointer-events-auto flex min-w-0 items-center gap-3">
        <h1 className="shrink-0 select-none">
          <img
            src="/favicon.svg"
            alt="Nylon Impossible"
            className="size-8 dark:hidden sm:size-9"
          />
          <img
            src="/favicon-dark.svg"
            alt="Nylon Impossible"
            className="hidden size-8 sm:size-9 dark:block"
          />
        </h1>
        <div className="w-56 min-w-0 sm:w-72">
          <TodoInput textareaRef={composerRef} />
        </div>
      </div>
      <div className="pointer-events-auto flex items-center gap-3">
        {!isMobile && (
          <Button
            variant="accentOutline"
            size="sm"
            type="button"
            onClick={openSettings}
            className="font-display font-bold"
          >
            Settings
          </Button>
        )}
        <UserButton>
          {isMobile && (
            <UserButton.MenuItems>
              <UserButton.Action
                label="Settings"
                labelIcon={<Settings size={14} />}
                onClick={openSettings}
              />
            </UserButton.MenuItems>
          )}
        </UserButton>
      </div>
    </div>
  );
}

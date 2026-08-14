import { UserButton } from "@clerk/tanstack-react-start";
import { Settings } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSettings } from "@/hooks/useSettings";
import { Button } from "./ui";

/**
 * Fixed chrome for the signed-in board: the editorial logotype top-left and
 * Settings/account top-right, floating above the full-bleed column grid.
 * Replaces the floating pill header (which Header.tsx suppresses on "/").
 */
export function BoardChrome() {
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
      <h1 className="pointer-events-auto select-none font-display text-lg font-extrabold tracking-tight text-accent-solid sm:text-xl">
        Nylon Impossible
      </h1>
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

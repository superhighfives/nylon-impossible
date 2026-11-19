import { Popover } from "@base-ui/react/popover";
import type { ReactElement } from "react";
import { Composer, type ComposerTarget } from "@/components/phone/Composer";
import { POPOVER_CARD } from "./NewListPopover";

/**
 * Quick add (New todo): the composer in a popover under the toolbar. It
 * starts on the selection's column (else Today), shows the target's name
 * and count, a chip per list and a due chip for typed dates. Enter adds and
 * keeps it open; Esc or a click outside closes it.
 */
export function QuickAdd({
  open,
  onOpenChange,
  trigger,
  startListId,
  targets,
  timeZone,
  countFor,
  isVisible,
  onView,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement<Record<string, unknown>>;
  startListId: string;
  targets: ComposerTarget[];
  timeZone: string;
  countFor: (listId: string) => number;
  isVisible: (listId: string) => boolean;
  onView: (listId: string) => void;
  /** Where focus goes on close: back to the board's selection. */
  returnFocus?: () => HTMLElement | null;
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger render={trigger} />
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={6}
          className="z-50"
        >
          <Popover.Popup
            aria-label="Quick add"
            finalFocus={() => returnFocus?.() ?? true}
            className={`${POPOVER_CARD} w-[26rem]`}
          >
            <Composer
              variant="popover"
              currentListId={startListId}
              targets={targets}
              timeZone={timeZone}
              countFor={countFor}
              isVisible={isVisible}
              onView={(listId) => {
                onOpenChange(false);
                onView(listId);
              }}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { Info } from "lucide-react";
import type { ReactNode } from "react";

export interface TooltipProps {
  children: ReactNode;
  render: ReactNode;
}

/** Hover/focus tooltip, positioned above its trigger by default. */
export function Tooltip({ children, render }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={<span />}>{children}</BaseTooltip.Trigger>
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={6}>
          <BaseTooltip.Popup className="z-50 max-w-64 rounded-lg border border-gray-subtle bg-gray-surface px-2.5 py-1.5 text-xs text-gray shadow-lg">
            {render}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}

/** Small (i) button that reveals `render` in a tooltip on hover/focus. */
export function InfoTooltip({ render }: { render: ReactNode }) {
  return (
    <Tooltip render={render}>
      <button
        type="button"
        className="inline-flex items-center justify-center text-gray-muted hover:text-gray transition-colors"
        aria-label="More information"
      >
        <Info size={13} />
      </button>
    </Tooltip>
  );
}

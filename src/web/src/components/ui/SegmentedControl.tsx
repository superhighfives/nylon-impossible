import { Menu } from "@base-ui/react/menu";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Check, ChevronDown, Ellipsis } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

export interface SegmentedControlItem {
  value: string;
  label: string;
}

export interface SegmentedControlProps {
  items: SegmentedControlItem[];
  /**
   * Extra options collected behind a trailing "more" segment, so the track
   * stays one fixed width however many there are. Picking one swaps the
   * segment's label to it.
   */
  overflowItems?: SegmentedControlItem[];
  value: string | undefined;
  onValueChange: (value: string) => void;
  "aria-label": string;
  disabled?: boolean;
  /** Fires when the overflow menu opens or closes. */
  onOverflowOpenChange?: (open: boolean) => void;
  className?: string;
}

const SEGMENT_CLASS =
  "relative z-10 flex h-6 min-w-0 flex-1 items-center justify-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap text-gray-muted transition-colors duration-150 outline-none hover:text-gray focus-visible:ring-2 focus-visible:ring-accent-strong disabled:pointer-events-none disabled:opacity-50 data-active:text-gray";

/**
 * A single-choice segmented control with an indicator that slides between
 * segments. Built on Base UI's ToggleGroup for roving arrow-key focus.
 */
export function SegmentedControl({
  items,
  overflowItems = [],
  value,
  onValueChange,
  "aria-label": ariaLabel,
  disabled,
  onOverflowOpenChange,
  className,
}: SegmentedControlProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(
    null,
  );
  // The first measurement places the indicator without a transition, so it
  // doesn't slide in from the left edge on mount.
  const [animate, setAnimate] = useState(false);

  const overflowSelected = overflowItems.find((item) => item.value === value);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the active segment or its label changes
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const active = track.querySelector<HTMLElement>("[data-active]");
      setIndicator(
        active ? { x: active.offsetLeft, w: active.offsetWidth } : null,
      );
    };
    measure();
    const frame = requestAnimationFrame(() => setAnimate(true));
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [value, overflowSelected?.label]);

  return (
    <div
      ref={trackRef}
      className={`relative flex items-center rounded-full bg-gray-base p-0.5 ${className ?? ""}`}
    >
      {indicator && (
        <span
          aria-hidden="true"
          className={`absolute top-0.5 bottom-0.5 left-0 rounded-full bg-gray-app shadow-sm ring-1 ring-gray-subtle dark:bg-gray-active ${
            animate
              ? "transition-[translate,width] duration-200 ease-out-strong"
              : ""
          }`}
          style={{ width: indicator.w, translate: `${indicator.x}px 0` }}
        />
      )}
      <ToggleGroup
        aria-label={ariaLabel}
        value={value && !overflowSelected ? [value] : []}
        onValueChange={(next) => {
          // Single-choice: ignore the "deselect" a second press would emit.
          if (next[0]) onValueChange(next[0]);
        }}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-center"
      >
        {items.map((item) => (
          <Toggle
            key={item.value}
            value={item.value}
            data-active={item.value === value ? "" : undefined}
            className={SEGMENT_CLASS}
          >
            {item.label}
          </Toggle>
        ))}
      </ToggleGroup>
      {overflowItems.length > 0 && (
        <Menu.Root onOpenChange={onOverflowOpenChange}>
          <Menu.Trigger
            disabled={disabled}
            aria-label={
              overflowSelected
                ? `${overflowSelected.label} — choose another list`
                : "More lists"
            }
            data-active={overflowSelected ? "" : undefined}
            className={`${SEGMENT_CLASS} ${overflowSelected ? "max-w-28" : "max-w-9"}`}
          >
            {overflowSelected ? (
              <>
                <span className="truncate">{overflowSelected.label}</span>
                <ChevronDown size={12} className="shrink-0" />
              </>
            ) : (
              <Ellipsis size={14} />
            )}
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="z-[90]" sideOffset={6} align="end">
              <Menu.Popup className="max-h-72 min-w-40 origin-(--transform-origin) overflow-y-auto rounded-xl border border-gray-subtle bg-gray-surface p-1 shadow-lg transition-[opacity,scale] duration-150 ease-out-strong data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:duration-100 data-starting-style:scale-[0.97] data-starting-style:opacity-0">
                <Menu.RadioGroup
                  value={overflowSelected?.value ?? null}
                  onValueChange={(next) => onValueChange(next as string)}
                >
                  {overflowItems.map((item) => (
                    <Menu.RadioItem
                      key={item.value}
                      value={item.value}
                      closeOnClick
                      className="relative flex cursor-pointer items-center rounded-lg py-1.5 pr-3 pl-8 text-sm text-gray outline-none select-none data-highlighted:bg-gray-hover"
                    >
                      <Menu.RadioItemIndicator className="absolute left-2.5 flex items-center">
                        <Check size={14} />
                      </Menu.RadioItemIndicator>
                      <span className="truncate">{item.label}</span>
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      )}
    </div>
  );
}

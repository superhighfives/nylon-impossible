import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import { type ComponentProps, useId } from "react";

/**
 * The focus ring's offset is filled with this color, so it needs to match
 * whatever the checkbox actually sits on — a panel/dialog/card (gray-surface,
 * the default) or the app background directly (the main todo row). Mismatching
 * the two paints a visible halo instead of a clean ring — see Button's
 * `ringOffset` for the same convention.
 */
const RING_OFFSET = {
  surface: "focus-visible:ring-offset-gray-surface",
  app: "focus-visible:ring-offset-gray-app",
} as const;

export interface CheckboxProps
  extends Omit<
    ComponentProps<typeof BaseCheckbox.Root>,
    "children" | "checked"
  > {
  label?: string;
  indeterminate?: boolean;
  checked?: boolean;
  variant?: "default" | "subtle";
  ringOffset?: keyof typeof RING_OFFSET;
}

export function Checkbox({
  className,
  label,
  indeterminate,
  checked,
  variant = "default",
  ringOffset = "surface",
  id: providedId,
  ...props
}: CheckboxProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  const checkedStyle =
    variant === "subtle"
      ? "data-checked:bg-gray-solid data-checked:border-gray-strong data-checked:text-gray-muted data-indeterminate:bg-gray-solid data-indeterminate:border-gray-strong data-indeterminate:text-gray-muted"
      : "data-checked:bg-accent-solid data-checked:border-accent-solid data-checked:text-accent-contrast data-indeterminate:bg-accent-solid data-indeterminate:border-accent-solid data-indeterminate:text-accent-contrast";

  return (
    <div className="inline-flex items-center gap-2">
      <BaseCheckbox.Root
        id={id}
        checked={checked}
        indeterminate={indeterminate}
        className={`
          relative before:absolute before:content-[''] before:-inset-2 h-5 w-5 shrink-0 rounded-md border-2 border-gray-12 dark:border-graydark-12 bg-transparent cursor-pointer
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 ${RING_OFFSET[ringOffset]}
          disabled:cursor-not-allowed disabled:opacity-50
          ${checkedStyle}
          transition-colors
          ${className ?? ""}
        `}
        {...props}
      >
        <BaseCheckbox.Indicator className="flex items-center justify-center text-current">
          {indeterminate ? (
            <Minus className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3" />
          )}
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      {label && (
        <label htmlFor={id} className="text-sm text-gray cursor-pointer">
          {label}
        </label>
      )}
    </div>
  );
}

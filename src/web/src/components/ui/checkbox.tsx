import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { Check, Minus } from "lucide-react";
import { type ComponentProps, useId } from "react";

export interface CheckboxProps
  extends Omit<
    ComponentProps<typeof BaseCheckbox.Root>,
    "children" | "checked"
  > {
  label?: string;
  indeterminate?: boolean;
  checked?: boolean;
  variant?: "default" | "subtle";
}

export function Checkbox({
  className,
  label,
  indeterminate,
  checked,
  variant = "default",
  id: providedId,
  ...props
}: CheckboxProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  const checkedStyle =
    variant === "subtle"
      ? "data-checked:bg-gray-solid data-checked:border-gray-strong data-checked:text-gray-muted data-indeterminate:bg-gray-solid data-indeterminate:border-gray-strong data-indeterminate:text-gray-muted"
      : "data-checked:bg-yellow-solid data-checked:border-yellow-solid data-checked:text-gray data-indeterminate:bg-yellow-solid data-indeterminate:border-yellow-solid data-indeterminate:text-gray";

  return (
    <div className="inline-flex items-center gap-2">
      <BaseCheckbox.Root
        id={id}
        checked={checked}
        indeterminate={indeterminate}
        className={`
          h-4 w-4 shrink-0 rounded-md border border-gray bg-gray-surface cursor-pointer
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-strong focus-visible:ring-offset-2 focus-visible:ring-offset-gray-app
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

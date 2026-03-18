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
}

export function Checkbox({
  className,
  label,
  indeterminate,
  checked,
  id: providedId,
  ...props
}: CheckboxProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <div className="inline-flex items-center gap-2">
      <BaseCheckbox.Root
        id={id}
        checked={checked}
        indeterminate={indeterminate}
        className={`
          h-4 w-4 shrink-0 rounded-md border border-gray bg-gray-surface cursor-pointer
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-strong focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1
          disabled:cursor-not-allowed disabled:opacity-50
          data-checked:bg-yellow-9 data-checked:border-yellow-9 data-checked:text-gray-12 dark:data-checked:bg-yellowdark-9 dark:data-checked:border-yellowdark-9
          data-indeterminate:bg-yellow-9 data-indeterminate:border-yellow-9 data-indeterminate:text-gray-12 dark:data-indeterminate:bg-yellowdark-9 dark:data-indeterminate:border-yellowdark-9
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

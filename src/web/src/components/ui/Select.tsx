import { Select as BaseSelect } from "@base-ui/react/select";
import { cva, type VariantProps } from "class-variance-authority";
import { Check, ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

interface SelectItem {
  value: string;
  label: string;
}

const selectTriggerVariants = cva(
  "flex w-full items-center justify-between rounded-lg bg-gray-surface text-gray ring-1 ring-gray-subtle placeholder:text-gray-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-strong focus-visible:ring-offset-2 focus-visible:ring-offset-gray-app disabled:cursor-not-allowed disabled:opacity-50 transition-colors [@supports(-webkit-touch-callout:none)]:!text-base",
  {
    variants: {
      size: {
        xs: "h-7 px-2 text-xs",
        sm: "h-8 px-2.5 text-sm",
        base: "h-9 px-3 text-sm",
        lg: "h-10 px-4 text-base",
      },
    },
    defaultVariants: {
      size: "base",
    },
  },
);

export interface SelectProps
  extends Omit<ComponentProps<typeof BaseSelect.Root>, "children" | "items">,
    VariantProps<typeof selectTriggerVariants> {
  placeholder?: string;
  items: SelectItem[];
  className?: string;
}

export function Select({
  placeholder = "Select an option",
  items,
  size,
  className,
  ...props
}: SelectProps) {
  return (
    <BaseSelect.Root items={items} {...props}>
      <BaseSelect.Trigger
        className={selectTriggerVariants({ size, className })}
      >
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon>
          <ChevronDown className="h-4 w-4 text-gray-muted" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false}>
          <BaseSelect.Popup className="z-50 min-w-32 overflow-hidden rounded-lg border border-gray-subtle bg-gray-surface p-1 shadow-lg">
            <BaseSelect.List className="flex flex-col">
              {items.map((item) => (
                <BaseSelect.Item
                  key={item.value}
                  value={item.value}
                  className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm text-gray outline-none hover:bg-gray-hover focus:bg-gray-hover data-disabled:pointer-events-none data-disabled:opacity-50 data-selected:bg-gray-active"
                >
                  <BaseSelect.ItemIndicator className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </BaseSelect.ItemIndicator>
                  <BaseSelect.ItemText>{item.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

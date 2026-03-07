import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

interface SelectItem {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<ComponentProps<typeof BaseSelect.Root>, "children" | "items"> {
  children?: ReactNode;
  placeholder?: string;
  items: SelectItem[];
}

export function Select({
  children,
  placeholder = "Select an option",
  items,
  ...props
}: SelectProps) {
  return (
    <BaseSelect.Root items={items} {...props}>
      <BaseSelect.Trigger className="flex h-9 w-full items-center justify-between rounded-md bg-gray-subtle px-3 py-2 text-sm text-gray-normal ring-1 ring-gray-6 placeholder:text-gray-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-8 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-1 disabled:cursor-not-allowed disabled:opacity-50 transition-colors">
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon>
          <ChevronDown className="h-4 w-4 text-gray-dim" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false}>
          <BaseSelect.Popup className="z-50 min-w-32 overflow-hidden rounded-md border border-gray-dim bg-gray-subtle p-1 shadow-lg">
            <BaseSelect.List className="flex flex-col">
              {items.map((item) => (
                <BaseSelect.Item
                  key={item.value}
                  value={item.value}
                  className="relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm text-gray-normal outline-none hover:bg-gray-4 focus:bg-gray-4 data-disabled:pointer-events-none data-disabled:opacity-50 data-selected:bg-gray-5"
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

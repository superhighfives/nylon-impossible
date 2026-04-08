import { Menu as BaseMenu } from "@base-ui/react/menu";
import { ChevronDown, ChevronUp, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "./ui";

interface TodoActionsMenuProps {
  todoId: string;
  todoTitle: string;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}

const menuItemBase =
  "flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-gray-hover focus:bg-gray-hover data-disabled:pointer-events-none data-disabled:opacity-50";

export function TodoActionsMenu({
  todoId,
  todoTitle,
  isExpanded,
  onToggleExpand,
  onDelete,
  deletePending,
}: TodoActionsMenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        render={
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            type="button"
            aria-label={`Actions for "${todoTitle}"`}
          >
            <MoreHorizontal size={16} />
          </Button>
        }
      />
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={4}>
          <BaseMenu.Popup className="z-50 min-w-32 overflow-hidden rounded-lg border border-gray-subtle bg-gray-surface p-1 shadow-lg">
            <BaseMenu.Item
              className={`${menuItemBase} text-gray`}
              onClick={() => onToggleExpand(todoId)}
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {isExpanded ? "Collapse details" : "Expand details"}
            </BaseMenu.Item>
            <BaseMenu.Item
              className={`${menuItemBase} text-red-muted`}
              disabled={deletePending}
              onClick={() => onDelete(todoId)}
            >
              <Trash2 size={14} />
              Delete
            </BaseMenu.Item>
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

import { ListPlus, Plus, Search } from "lucide-react";
import type { ComponentProps } from "react";
import { NewListPopover } from "./NewListPopover";
import { QuickAdd } from "./QuickAdd";

const TOOL_BUTTON =
  "flex size-9 cursor-pointer items-center justify-center rounded-full text-n-ink-muted n-focus-soft pointer-fine:hover:bg-n-fill pointer-fine:hover:text-n-ink";

/**
 * The row above the columns: at the right, a pill of Search (⌘K), New todo
 * (quick add) and New list. The popovers hand focus back to the selection
 * when they close.
 */
export function Toolbar({
  onSearch,
  quickAdd,
  newList,
}: {
  onSearch: () => void;
  quickAdd: Omit<ComponentProps<typeof QuickAdd>, "trigger">;
  newList: Omit<ComponentProps<typeof NewListPopover>, "trigger" | "align">;
}) {
  return (
    <div className="flex h-16 shrink-0 items-center justify-end border-b border-n-hairline px-4">
      <div className="flex items-center gap-0.5 rounded-full border border-n-hairline bg-n-surface p-[3px]">
        <button
          type="button"
          aria-label="Search and commands"
          title="Search and commands (⌘K)"
          aria-keyshortcuts="Meta+K Control+K"
          onClick={onSearch}
          className={TOOL_BUTTON}
        >
          <Search size={16} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <QuickAdd
          {...quickAdd}
          trigger={
            <button
              type="button"
              aria-label="New todo"
              title="New todo (N)"
              aria-keyshortcuts="N"
              className={TOOL_BUTTON}
            >
              <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          }
        />
        <NewListPopover
          {...newList}
          align="end"
          trigger={
            <button
              type="button"
              aria-label="New list"
              title="New list (⇧N)"
              aria-keyshortcuts="Shift+N"
              className={TOOL_BUTTON}
            >
              <ListPlus size={16} strokeWidth={2.2} aria-hidden="true" />
            </button>
          }
        />
      </div>
    </div>
  );
}

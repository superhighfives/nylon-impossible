import { MoreHorizontal } from "lucide-react";
import { Button } from "./ui";

interface TodoActionsMenuProps {
  todoId: string;
  todoTitle: string;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}

/**
 * TODO (backlog): Replace this stub with a Base UI Popover/Menu component.
 *
 * On mobile there is no hover state, so the edit/delete buttons on each todo
 * row are always visible, cluttering the UI. This component should render a
 * single "⋯" trigger button that opens a Base UI popover (or menu) with the
 * Edit and Delete actions inside.
 *
 * Implementation notes:
 * - Use `@base-ui/react/menu` (Menu.Root, Menu.Trigger, Menu.Portal,
 *   Menu.Positioner, Menu.Popup, Menu.Item) — available in @base-ui/react ^1.2.0.
 * - Show only on mobile (below the `sm` breakpoint); the desktop row already
 *   reveals the two buttons on hover.
 * - The Delete item should use a destructive/red style and pass `deletePending`
 *   to disable itself while deletion is in flight.
 * - Ensure proper aria-labels and keyboard navigation.
 */
export function TodoActionsMenu({
  todoId,
  todoTitle,
  isExpanded,
  onToggleExpand,
  onDelete,
  deletePending,
}: TodoActionsMenuProps) {
  return (
    // Stub: renders a plain button — replace with Base UI Menu popover
    <Button
      variant="ghost"
      size="sm"
      type="button"
      aria-label={`Actions for "${todoTitle}"`}
      onClick={() => {
        // TODO: open popover menu instead
        onToggleExpand(todoId);
      }}
    >
      <MoreHorizontal size={16} />
    </Button>
  );
}

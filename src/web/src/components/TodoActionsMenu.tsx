/**
 * TODO (backlog): Implement a Base UI popover menu for mobile todo row actions.
 *
 * Context:
 * On mobile there is no hover state, so the Edit and Delete buttons on each
 * todo row in TodoList.tsx are always visible, cluttering the UI. This
 * component should provide a single "⋯" trigger that opens a popover menu
 * with those two actions.
 *
 * Design spec:
 * - Render only on mobile (< sm breakpoint); desktop keeps the existing
 *   inline Edit/Delete buttons that appear on row hover.
 * - Trigger: a ghost icon button using <MoreHorizontal> (lucide-react).
 * - Menu items: "Edit" (calls onToggleExpand) and "Delete" (calls onDelete,
 *   destructive style, disabled while deletePending is true).
 *
 * Implementation notes:
 * - Use `@base-ui/react/menu` — Menu.Root, Menu.Trigger, Menu.Portal,
 *   Menu.Positioner, Menu.Popup, Menu.Item — available in @base-ui/react ^1.2.0.
 * - Follow the same Portal + Positioner pattern used in Select (select.tsx).
 * - Match the popup styling used elsewhere: rounded-lg, bg-gray-surface,
 *   border-gray-subtle, shadow-lg, p-1.
 * - Wire into TodoList.tsx: render <TodoActionsMenu> in place of the button
 *   div on mobile (sm:hidden), keeping the existing div for desktop (hidden sm:flex).
 */

import type { MoreHorizontal } from "lucide-react"; // remove `type` when implementing

export interface TodoActionsMenuProps {
  todoId: string;
  todoTitle: string;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}

export function TodoActionsMenu(_props: TodoActionsMenuProps): null {
  // Not yet implemented — see TODO above
  return null;
}

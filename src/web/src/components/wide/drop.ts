import { dropPlacement } from "@/lib/dragOrder";
import type { TodoWithUrls } from "@/types/database";

export type Drop =
  /** Dropped on a sidebar list: moves to the top, with Undo. */
  | { kind: "move"; listId: string }
  /** Dropped in a column: lands at that exact slot. */
  | { kind: "place"; listId: string; position: string };

/**
 * What dropping `todo` on droppable `overId` does. Sidebar entries are
 * `side:<listId>`, columns `col:<listId>`; `slot` is the pointer's slot
 * among the column's other rows. Null when nothing should change.
 */
export function resolveDrop({
  overId,
  todo,
  rowsFor,
  slot,
}: {
  overId: string | number | null | undefined;
  todo: TodoWithUrls;
  rowsFor: (listId: string) => TodoWithUrls[];
  slot: number;
}): Drop | null {
  if (typeof overId !== "string") return null;
  if (overId.startsWith("side:")) {
    const listId = overId.slice(5);
    return listId === todo.listId ? null : { kind: "move", listId };
  }
  if (overId.startsWith("col:")) {
    const listId = overId.slice(4);
    const { position } = dropPlacement(rowsFor(listId), todo, slot);
    if (listId === todo.listId && position === todo.position) return null;
    return { kind: "place", listId, position };
  }
  return null;
}

import type { UpdateListInput } from "@/types/database";
import type { List } from "./schema";

/** The columns `updateList` writes: only what the input names. */
export function listUpdates(input: UpdateListInput): Partial<List> {
  const updates: Partial<List> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.position !== undefined) updates.position = input.position;
  if (input.columnHidden !== undefined)
    updates.columnHidden = input.columnHidden;
  return updates;
}

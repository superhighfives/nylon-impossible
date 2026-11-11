import type { SerializedList, UpdateListInput } from "@/types/database";
import type { List } from "./schema";

/** A list as `getLists` and `updateList` return it. Null `columnHidden` is shown. */
export function serializeList(list: List): SerializedList {
  return {
    id: list.id,
    userId: list.userId,
    name: list.name,
    kind: list.kind,
    systemKind: list.systemKind,
    position: list.position,
    columnHidden: list.columnHidden ?? false,
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}

/** The columns `updateList` writes: only what the input names. */
export function listUpdates(input: UpdateListInput): Partial<List> {
  const updates: Partial<List> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.position !== undefined) updates.position = input.position;
  if (input.columnHidden !== undefined)
    updates.columnHidden = input.columnHidden;
  return updates;
}

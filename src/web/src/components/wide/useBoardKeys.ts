import { useEffect } from "react";
import { focusOnBoard } from "./boardDom";
import { type Board, commandForKey } from "./commands";
import { isTypingTarget } from "./keys";

/**
 * The board's one keydown listener: each key is a command in `commands.ts`,
 * run against `board`. After G (`takeGo` says one was waiting), the next key
 * is a destination; anything else cancels the G and does its usual job.
 */
export function useBoardKeys({
  board,
  takeGo,
  admin,
  modal,
}: {
  board: Board;
  takeGo: () => boolean;
  /** Send feedback (F) is admins' only. */
  admin: boolean;
  /**
   * Settings or Send feedback is open. They're modal, so every key is left
   * alone, ⌘K included, or the palette would act on the board behind them.
   */
  modal: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const afterG = takeGo();
      const hit =
        (afterG ? commandForKey(e, { afterG: true }) : null) ??
        commandForKey(e);
      if (!hit) return;
      const { command, arg } = hit;
      if (!command.anywhere && isTypingTarget(e.target)) return;
      if (command.admin && !admin) return;
      if (modal) return;
      // Keys that act on a todo act on the selection while focus is on the
      // board (or nowhere), not from the sidebar or toolbar.
      if (command.needsSelection && !focusOnBoard()) return;
      e.preventDefault();
      command.run(board, arg);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
}

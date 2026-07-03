import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "@/lib/toast";

/** A freshly-imported todo that carries a due date, so it can hold a repeat
 * schedule the user may want to set. */
export interface ReviewTodo {
  id: string;
  title: string;
  dueDate: string;
}

interface ImportReviewContextValue {
  /** Whether the post-import "set repeat schedules" modal is showing. */
  isReviewOpen: boolean;
  /** Dated todos offered for repeat-schedule review. */
  reviewTodos: ReviewTodo[];
  /** IDs of just-imported todos to briefly highlight in the list. */
  highlightIds: ReadonlySet<string>;
  /** IDs kept out of the list until the user finishes reviewing, so imports
   * don't appear (and the toast doesn't fire) mid-decision. */
  hiddenIds: ReadonlySet<string>;
  /** Kick off the review after a successful import. */
  startReview: (opts: {
    importedIds: string[];
    datedTodos: ReviewTodo[];
    imported: number;
  }) => void;
  /** Finish the review: reveal the imports, glow them, and toast. */
  closeReview: () => void;
}

const noop = () => {};

export const ImportReviewContext = createContext<ImportReviewContextValue>({
  isReviewOpen: false,
  reviewTodos: [],
  highlightIds: new Set(),
  hiddenIds: new Set(),
  startReview: noop,
  closeReview: noop,
});

export function useImportReview() {
  return useContext(ImportReviewContext);
}

// How long imported rows stay tinted before the highlight fades out.
const HIGHLIGHT_MS = 2000;

export function useImportReviewValue(): ImportReviewContextValue {
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewTodos, setReviewTodos] = useState<ReviewTodo[]>([]);
  const [highlightIds, setHighlightIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  // What to reveal once the review modal is dismissed — held back so the
  // imports (and their toast) don't surface while the user is still deciding.
  const pending = useRef<{ importedIds: string[]; imported: number }>({
    importedIds: [],
    imported: 0,
  });
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Surface the imports: unhide them, glow them briefly, and announce the count.
  const reveal = useCallback((importedIds: string[], imported: number) => {
    setHiddenIds(new Set());
    if (importedIds.length > 0) {
      setHighlightIds(new Set(importedIds));
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => {
        setHighlightIds(new Set());
      }, HIGHLIGHT_MS);
    }
    if (imported > 0) {
      toast.success(
        `Imported ${imported} ${imported === 1 ? "task" : "tasks"} from Google`,
      );
    }
  }, []);

  const startReview = useCallback(
    ({
      importedIds,
      datedTodos,
      imported,
    }: {
      importedIds: string[];
      datedTodos: ReviewTodo[];
      imported: number;
    }) => {
      if (datedTodos.length > 0) {
        // Hold everything back until the user finishes the review.
        setHiddenIds(new Set(importedIds));
        pending.current = { importedIds, imported };
        setReviewTodos(datedTodos);
        setIsReviewOpen(true);
      } else {
        // No repeat schedules to set — surface the imports immediately.
        reveal(importedIds, imported);
      }
    },
    [reveal],
  );

  const closeReview = useCallback(() => {
    setIsReviewOpen(false);
    reveal(pending.current.importedIds, pending.current.imported);
    pending.current = { importedIds: [], imported: 0 };
  }, [reveal]);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  return {
    isReviewOpen,
    reviewTodos,
    highlightIds,
    hiddenIds,
    startReview,
    closeReview,
  };
}

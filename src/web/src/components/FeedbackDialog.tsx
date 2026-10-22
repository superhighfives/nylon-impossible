import { Dialog } from "@base-ui/react/dialog";
import { ImagePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSendFeedback } from "@/hooks/useFeedback";
import { useUser } from "@/hooks/useUser";
import {
  type FeedbackImage,
  feedbackContext,
  imageFiles,
  MAX_DESCRIPTION,
  MAX_IMAGES,
  prepareImage,
} from "@/lib/feedback";
import { messageFromError, toast } from "@/lib/toast";

interface Attachment {
  id: string;
  /** Object URL of the original, for the thumbnail. */
  preview: string;
  image: FeedbackImage;
}

/** Whether the signed-in account sees feedback at all. */
export function useCanSendFeedback(): boolean {
  return useUser().data?.isAdmin === true;
}

const POPUP = {
  // The phone: a bottom sheet, like the account menu.
  sheet:
    "fixed inset-x-2.5 bottom-[calc(0.625rem+env(safe-area-inset-bottom,0px))] mx-auto max-w-md rounded-[1.625rem] p-4 data-ending-style:translate-y-6 data-starting-style:translate-y-6 dark:bg-n-surface",
  // The wide board: small and centred, like the shortcuts overlay.
  centered:
    "fixed top-1/2 left-1/2 w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-[0.875rem] p-5 dark:bg-n-fill",
} as const;

/**
 * "Send feedback": a sentence and up to four screenshots, filed as an issue
 * in the private inbox. Images come in by paste (⌘V anywhere while it's
 * open), drag and drop, or the picker. Admins only — renders nothing for
 * everyone else.
 */
export function FeedbackDialog({
  open,
  onClose,
  variant,
}: {
  open: boolean;
  onClose: () => void;
  variant: "sheet" | "centered";
}) {
  const canSend = useCanSendFeedback();
  const send = useSendFeedback();
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  // Read in async callbacks without going stale.
  const count = useRef(0);
  count.current = attachments.length + preparing;

  const add = async (files: File[]) => {
    const room = MAX_IMAGES - count.current;
    if (room <= 0) {
      toast.info(`Up to ${MAX_IMAGES} images`);
      return;
    }
    const taken = files.slice(0, room);
    if (files.length > room) toast.info(`Up to ${MAX_IMAGES} images`);
    setPreparing((n) => n + taken.length);
    await Promise.all(
      taken.map(async (file) => {
        try {
          const image = await prepareImage(file);
          setAttachments((list) => [
            ...list,
            {
              id: crypto.randomUUID(),
              preview: URL.createObjectURL(file),
              image,
            },
          ]);
        } catch {
          toast.error("Couldn't read that image");
        } finally {
          setPreparing((n) => n - 1);
        }
      }),
    );
  };

  const remove = (id: string) =>
    setAttachments((list) => {
      const gone = list.find((a) => a.id === id);
      if (gone) URL.revokeObjectURL(gone.preview);
      return list.filter((a) => a.id !== id);
    });

  const reset = () => {
    for (const a of attachments) URL.revokeObjectURL(a.preview);
    setAttachments([]);
    setDescription("");
  };

  // ⌘V anywhere in the dialog, not just the text field. A text paste still
  // lands in the field as usual.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = imageFiles(e.clipboardData?.files ?? []);
      if (files.length === 0) return;
      e.preventDefault();
      void add(files);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  if (!canSend) return null;

  const text = description.trim();
  const ready = text.length > 0 && preparing === 0 && !send.isPending;

  const submit = () => {
    if (!ready) return;
    send.mutate(
      {
        description: text,
        images: attachments.map((a) => a.image),
        context: feedbackContext(),
      },
      {
        onSuccess: ({ issueNumber, issueUrl }) => {
          reset();
          onClose();
          toast.success(`Filed #${issueNumber}`, {
            actionProps: {
              children: "Open",
              onClick: () => window.open(issueUrl, "_blank", "noopener"),
            },
          });
        },
        onError: (err) =>
          toast.error(messageFromError(err, "Couldn't send feedback")),
      },
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[color-mix(in_srgb,black_28%,transparent)] transition-opacity duration-(--n-duration-base) data-ending-style:opacity-0 data-starting-style:opacity-0 dark:bg-[color-mix(in_srgb,black_55%,transparent)]" />
        <Dialog.Popup
          initialFocus={textarea}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setDropping(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setDropping(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDropping(false);
            void add(imageFiles(e.dataTransfer.files));
          }}
          className={`z-50 bg-n-canvas text-n-ink shadow-[0_10px_40px_color-mix(in_srgb,black_18%,transparent)] outline-none transition-[translate,opacity] duration-(--n-duration-base) ease-n-out data-ending-style:opacity-0 data-starting-style:opacity-0 ${POPUP[variant]} ${
            dropping ? "ring-2 ring-n-brand" : ""
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="m-0 font-n-display text-[1.375rem] font-semibold tracking-[-0.01em]">
              Send feedback
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="-mr-2 flex size-9 cursor-pointer items-center justify-center rounded-n-chip text-n-ink-muted n-focus pointer-fine:hover:bg-n-surface"
            >
              <X size={15} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-0 mb-3 text-[0.8125rem] leading-[1.125rem] text-n-ink-muted">
            Paste, drop or add screenshots. The page, theme and window size are
            attached for you.
          </Dialog.Description>
          <label className="block">
            <span className="sr-only">What’s wrong?</span>
            <textarea
              ref={textarea}
              value={description}
              maxLength={MAX_DESCRIPTION}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="What’s wrong?"
              rows={4}
              className="field-sizing-content block max-h-60 min-h-24 w-full resize-none rounded-n-field bg-n-surface px-3.5 py-3 text-base leading-[1.45] text-n-ink n-focus placeholder:text-n-ink-muted dark:bg-n-canvas"
            />
          </label>

          <ul aria-label="Screenshots" className="mt-3 flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <li key={a.id} className="relative">
                <img
                  src={a.preview}
                  alt={`Screenshot ${i + 1}`}
                  className="size-16 rounded-n-chip border border-n-hairline object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove screenshot ${i + 1}`}
                  onClick={() => remove(a.id)}
                  className="absolute -top-2 -right-2 flex size-6 cursor-pointer items-center justify-center rounded-full bg-n-ink text-n-canvas n-focus"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
            {Array.from({ length: preparing }, (_, i) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity
                key={`preparing-${i}`}
                aria-label="Preparing screenshot"
                className="size-16 animate-pulse rounded-n-chip bg-n-fill"
              />
            ))}
            {count.current < MAX_IMAGES && (
              <li>
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex size-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-n-chip border border-dashed border-n-hairline text-[0.6875rem] text-n-ink-muted n-focus pointer-fine:hover:bg-n-surface"
                >
                  <ImagePlus size={16} aria-hidden="true" />
                  Add
                </button>
              </li>
            )}
          </ul>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            data-testid="feedback-file"
            onChange={(e) => {
              void add(imageFiles(e.currentTarget.files ?? []));
              e.currentTarget.value = "";
            }}
          />

          <div className="mt-4 flex items-center justify-end gap-3">
            <span className="mr-auto text-xs text-n-ink-muted">
              <kbd className="font-n-text">⌘↩</kbd> to send
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!ready}
              className="h-10 cursor-pointer rounded-n-field bg-n-brand px-4 text-[0.9375rem] font-semibold text-n-brand-ink n-focus transition-[opacity,transform] duration-(--n-duration-fast) active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
            >
              {send.isPending ? "Sending…" : "Send"}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

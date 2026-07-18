import { Menu as BaseMenu } from "@base-ui/react/menu";
import { ChevronDown, Plus, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { useSmartCreate } from "@/hooks/useTodos";
import { useUser } from "@/hooks/useUser";
import { messageFromError, toast } from "@/lib/toast";
import { Button, Loader, Textarea } from "./ui";

const menuItemBase =
  "flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-gray-hover focus:bg-gray-hover data-disabled:pointer-events-none data-disabled:opacity-50";

export function TodoInput() {
  const [text, setText] = useState("");

  const smartCreate = useSmartCreate();
  const { data: user } = useUser();
  const trimmed = text.trim();

  // AI is opt-in and gated on the aiEnabled master switch; the split-button
  // menu only appears when AI is on, so AI-off users see a plain Add button.
  const aiAvailable = user?.aiEnabled === true;

  const submit = (opts: { enrich?: boolean; research?: boolean } = {}) => {
    if (!trimmed || smartCreate.isPending) return;
    smartCreate.mutate(
      { text: trimmed, ...opts },
      {
        onSuccess: (result) => {
          setText("");
          if (result.todos.length > 1) {
            toast.success(`Added ${result.todos.length} items`);
          }
        },
        onError: (err) => {
          toast.error(messageFromError(err, "Couldn't add todo"));
        },
      },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  function renderTrailing() {
    if (smartCreate.isPending) {
      return (
        <div className="absolute right-3 bottom-3">
          <Loader size="sm" className="text-gray-muted" />
        </div>
      );
    }
    if (!trimmed) return null;

    return (
      <div className="absolute right-2 bottom-2 flex items-center">
        <Button
          type="submit"
          variant="primary"
          size="xs"
          shape="square"
          // `relative` scopes the tap-target pseudo-element to this button; in
          // split mode it stays flush on the right (before:right-0) so it never
          // overlays the adjacent menu trigger and steals its clicks.
          className={`relative transition-[background-color,color,transform] active:scale-[0.96] before:absolute before:content-[''] before:-top-[6px] before:-bottom-[6px] before:-left-[6px] ${
            aiAvailable
              ? "rounded-r-none before:right-0"
              : "before:-right-[6px]"
          }`}
          aria-label="Add todo"
        >
          <Plus size={14} />
        </Button>
        {aiAvailable && (
          <BaseMenu.Root>
            <BaseMenu.Trigger
              render={
                <Button
                  type="button"
                  variant="primary"
                  size="xs"
                  shape="square"
                  // Its own tap-target pseudo-element, flush on the left
                  // (before:left-0) so it meets — but never overlaps — the
                  // submit button at the seam.
                  className="relative rounded-l-none border-l border-yellow-solid-hover before:absolute before:content-[''] before:-top-[6px] before:-bottom-[6px] before:-right-[6px] before:left-0"
                  aria-label="Add with AI"
                >
                  <ChevronDown size={12} />
                </Button>
              }
            />
            <BaseMenu.Portal>
              <BaseMenu.Positioner sideOffset={4} align="end">
                <BaseMenu.Popup className="z-50 min-w-40 overflow-hidden rounded-lg border border-gray-subtle bg-gray-surface p-1 shadow-lg">
                  <BaseMenu.Item
                    className={`${menuItemBase} text-gray`}
                    onClick={() => submit({ enrich: true })}
                  >
                    <Sparkles size={14} />
                    Add + enrich
                  </BaseMenu.Item>
                  <BaseMenu.Item
                    className={`${menuItemBase} text-gray`}
                    onClick={() => submit({ research: true })}
                  >
                    <Search size={14} />
                    Add + research
                  </BaseMenu.Item>
                </BaseMenu.Popup>
              </BaseMenu.Positioner>
            </BaseMenu.Portal>
          </BaseMenu.Root>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 todo-input-wrapper">
      <form onSubmit={handleSubmit}>
        <div className="todo-input-container relative bg-gray-surface shadow-base rounded-2xl">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs to be done?"
            aria-label="New todo"
            disabled={smartCreate.isPending}
            rows={1}
            className={`w-full resize-none min-h-0 rounded-2xl transition-[padding] ${trimmed ? "pb-12" : ""}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          {renderTrailing()}
        </div>
      </form>
    </div>
  );
}

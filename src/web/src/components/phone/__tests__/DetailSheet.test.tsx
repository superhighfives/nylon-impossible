import { type Recurrence, TODO_NOTES_MAX } from "@nylon-impossible/shared";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@/lib/toast";
import type { TodoActions } from "../useTodoActions";
import { dueIn, makeTodo, makeUrl } from "./fixtures";

const createTodo = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useTodos", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useAddTodoUrl: mutation,
    useCreateTodo: () => ({ mutate: createTodo, isPending: false }),
    useDeleteTodo: mutation,
    useDeleteTodoUrl: mutation,
    useProcessTodo: mutation,
    useUpdateTodo: mutation,
    useUpdateUrlPreview: mutation,
  };
});

import { DetailSheet } from "../DetailSheet";

describe("DetailSheet", () => {
  describe.each([
    ["phone", undefined],
    ["column", "column"],
  ] as const)("Due, %s", (_, variant) => {
    function openDue(dueDate: string | null) {
      const save = vi.fn();
      const container = document.createElement("div");
      document.body.appendChild(container);
      render(
        <DetailSheet
          todo={makeTodo({ dueDate })}
          subtasks={[]}
          listTargets={[]}
          listName={() => "Today"}
          listInSentence={() => "today"}
          timeZone="UTC"
          actions={{ save, destroy: vi.fn() } as unknown as TodoActions}
          onClose={vi.fn()}
          variant={variant}
          container={variant ? container : undefined}
          animated={false}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: /^Due/ }));
      const group = screen.getByRole("group", { name: "Due" });
      const names = within(group)
        .getAllByRole("button")
        .map((b) => b.textContent);
      return { save, group, names };
    }

    it("is labelled Due, and offers no No date when there's no date", () => {
      expect(screen.queryByRole("button", { name: "Due date" })).toBeNull();
      const { group, names } = openDue(null);
      expect(names).toEqual([
        "Today",
        "Tomorrow",
        "Friday",
        "Next week",
        "Pick a date…",
      ]);
      expect(within(group).queryByRole("button", { pressed: true })).toBeNull();
    });

    it("ends with a red No date chip, no divider, when a date is set", () => {
      const { save, group, names } = openDue(dueIn(1));
      expect(names).toEqual([
        "Today",
        "Tomorrow",
        "Friday",
        "Next week",
        "Pick a date…",
        "No date",
      ]);
      expect(within(group).queryByRole("separator")).toBeNull();
      const clear = within(group).getByRole("button", { name: "No date" });
      expect(clear).toHaveClass("text-n-destructive");
      expect(clear).not.toHaveClass("text-n-ink-muted");
      fireEvent.click(clear);
      expect(save).toHaveBeenCalledWith(expect.any(String), {
        dueDate: null,
        recurrence: null,
      });
    });

    it("outlines Pick a date…'s calendar like the chips", () => {
      const { group } = openDue(dueIn(1));
      fireEvent.click(
        within(group).getByRole("button", { name: "Pick a date…" }),
      );
      const frame = screen
        .getByRole("button", { name: "Previous month" })
        .closest(".border");
      expect(frame).toHaveClass("border-n-hairline", "rounded-n-field");
      expect(frame).not.toContainElement(group);
    });
  });

  describe.each([
    ["phone", undefined],
    ["column", "column"],
  ] as const)("Repeat, %s", (_, variant) => {
    function openRepeat(recurrence: Recurrence | null) {
      const save = vi.fn();
      const container = document.createElement("div");
      document.body.appendChild(container);
      render(
        <DetailSheet
          todo={makeTodo({ dueDate: dueIn(1), recurrence })}
          subtasks={[]}
          listTargets={[]}
          listName={() => "Today"}
          listInSentence={() => "today"}
          timeZone="UTC"
          actions={{ save, destroy: vi.fn() } as unknown as TodoActions}
          onClose={vi.fn()}
          variant={variant}
          container={variant ? container : undefined}
          animated={false}
        />,
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: recurrence ? "Weekly" : "Repeat",
          expanded: false,
        }),
      );
      const group = screen.getByRole("group", { name: "Repeat" });
      const names = within(group)
        .getAllByRole("button")
        .map((b) => b.textContent);
      return { save, group, names };
    }

    it("lists the frequencies, with nothing pressed, when nothing repeats", () => {
      const { group, names } = openRepeat(null);
      expect(names).toEqual(["Daily", "Weekly", "Monthly", "Yearly"]);
      expect(within(group).queryByRole("button", { pressed: true })).toBeNull();
    });

    it("ends with a red Don’t repeat chip when it repeats, and no Never", () => {
      const { save, group, names } = openRepeat({ frequency: "weekly" });
      expect(names).toEqual([
        "Daily",
        "Weekly",
        "Monthly",
        "Yearly",
        "Don’t repeat",
      ]);
      expect(names).not.toContain("Never");
      expect(
        within(group).getByRole("button", { pressed: true }),
      ).toHaveTextContent("Weekly");
      expect(within(group).queryByRole("separator")).toBeNull();
      const clear = within(group).getByRole("button", { name: "Don’t repeat" });
      expect(clear).toHaveClass("text-n-destructive");
      expect(clear).not.toHaveClass("text-n-ink-muted");
      fireEvent.click(clear);
      expect(save).toHaveBeenCalledWith(expect.any(String), {
        recurrence: null,
      });
    });
  });

  it("keeps each footer stamp whole, so Edited wraps as one piece", () => {
    render(
      <DetailSheet
        todo={makeTodo({
          createdAt: "2025-10-07T12:00:00.000Z",
          updatedAt: "2025-10-22T12:00:00.000Z",
        })}
        subtasks={[]}
        listTargets={[]}
        listName={() => "Today"}
        listInSentence={() => "today"}
        timeZone="UTC"
        actions={{ save: vi.fn(), destroy: vi.fn() } as unknown as TodoActions}
        onClose={vi.fn()}
      />,
    );
    const created = screen.getByText("Created Oct 7");
    const edited = screen.getByText("Edited Oct 22");
    expect(created.parentElement).toBe(edited.parentElement);
    for (const stamp of [created, edited]) {
      expect(stamp).toHaveClass("whitespace-nowrap");
    }
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass(
      "shrink-0",
    );
  });

  it.each([
    ["phone", undefined],
    ["column", "column"],
  ] as const)(
    "drops the stamps below Delete when they don't fit beside it, %s",
    (_, variant) => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      render(
        <DetailSheet
          todo={makeTodo({})}
          subtasks={[]}
          listTargets={[]}
          listName={() => "Today"}
          listInSentence={() => "today"}
          timeZone="UTC"
          actions={
            { save: vi.fn(), destroy: vi.fn() } as unknown as TodoActions
          }
          onClose={vi.fn()}
          variant={variant}
          container={variant ? container : undefined}
          animated={false}
        />,
      );
      // The row wraps rather than squeezing the stamps into two lines beside
      // Delete (#730); jsdom has no layout, so this checks the flex setup.
      // The row breaks lines on the stamps' one-line width, so that box has
      // to keep its content-sized basis: a zero basis or grow would let it
      // shrink beside Delete instead of dropping below it.
      const footer = screen.getByRole("button", {
        name: "Delete",
      }).parentElement;
      expect(footer).toHaveClass("flex-wrap", "justify-between");
      expect(footer).not.toHaveClass("flex-nowrap");
      const stamps = screen.getByText(/^Created /).parentElement?.parentElement;
      expect(stamps?.parentElement).toBe(footer);
      expect(stamps?.className).not.toMatch(
        /(^|\s)(flex-1|flex-auto|grow|basis-\S+)(\s|$)/,
      );
    },
  );

  it("marks the open todo as a todo at the start of its subline, on wide", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    render(
      <DetailSheet
        todo={makeTodo({ title: "Camera", listId: "list-today" })}
        subtasks={[]}
        listTargets={[]}
        listName={() => "Today"}
        listInSentence={() => "today"}
        timeZone="UTC"
        actions={{ save: vi.fn(), destroy: vi.fn() } as unknown as TodoActions}
        onClose={vi.fn()}
        variant="column"
        container={container}
        animated={false}
      />,
    );
    const subline = screen.getByText("In today").parentElement;
    const icon = subline?.firstElementChild;
    expect(icon).toHaveAttribute("data-icon", "todo");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).toHaveAttribute("width", "16");
    container.remove();
  });

  it("leaves the phone sheet's subline without an icon", () => {
    render(
      <DetailSheet
        todo={makeTodo({ title: "Camera" })}
        subtasks={[]}
        listTargets={[]}
        listName={() => "Today"}
        listInSentence={() => "today"}
        timeZone="UTC"
        actions={{ save: vi.fn(), destroy: vi.fn() } as unknown as TodoActions}
        onClose={vi.fn()}
      />,
    );
    expect(document.querySelector("[data-icon]")).toBeNull();
  });

  it("shows subtasks and links by code point, and adds a subtask last", () => {
    const parent = makeTodo({
      urls: [
        makeUrl({ id: "l-a0", url: "https://example.com/a0", position: "a0" }),
        makeUrl({ id: "l-Zz", url: "https://example.com/Zz", position: "Zz" }),
      ],
    });
    const sub = (title: string, position: string) =>
      makeTodo({ id: title, title, position, parentId: parent.id });
    render(
      <DetailSheet
        todo={parent}
        subtasks={[
          sub("a0", "a0"),
          sub("aa", "aa"),
          sub("Zz", "Zz"),
          sub("aZ", "aZ"),
        ]}
        listTargets={[]}
        listName={() => "Today"}
        listInSentence={() => "today"}
        timeZone="UTC"
        actions={{ save: vi.fn(), destroy: vi.fn() } as unknown as TodoActions}
        onClose={vi.fn()}
      />,
    );
    const subtasks = screen.getByRole("region", { name: /Subtasks/ });
    expect(
      within(subtasks)
        .getAllByRole("button", { pressed: false })
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Zz", "a0", "aZ", "aa"]);
    const links = screen.getByRole("region", { name: "Links" });
    expect(
      within(links)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["https://example.com/Zz", "https://example.com/a0"]);

    const input = screen.getByRole("textbox", { name: "New subtask" });
    fireEvent.change(input, { target: { value: "Pack" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(createTodo).toHaveBeenCalledTimes(1);
    expect(createTodo.mock.calls[0][0].position > "aa").toBe(true);
  });

  it.each([
    ["phone", undefined],
    ["column", "column"],
  ] as const)(
    "pads Add subtask and Paste a link inside their focus tint, %s",
    (_, variant) => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      render(
        <DetailSheet
          todo={makeTodo()}
          subtasks={[]}
          listTargets={[]}
          listName={() => "Today"}
          listInSentence={() => "today"}
          timeZone="UTC"
          actions={
            { save: vi.fn(), destroy: vi.fn() } as unknown as TodoActions
          }
          onClose={vi.fn()}
          variant={variant}
          container={variant ? container : undefined}
          animated={false}
        />,
      );
      for (const name of ["New subtask", "Add a link"]) {
        const field = screen.getByRole("textbox", { name });
        expect(field).toHaveClass("n-focus", "px-2", "-ml-2");
      }
    },
  );

  it("shows Couldn’t show this in place of a todo that fails to draw", () => {
    // React logs the caught error; the test is that it's caught.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const { urls: _, ...bare } = makeTodo({ title: "Olive oil" });
    render(
      <DetailSheet
        todo={bare as ReturnType<typeof makeTodo>}
        subtasks={[]}
        listTargets={[]}
        listName={() => "Today"}
        listInSentence={() => "today"}
        timeZone="UTC"
        actions={{ save: vi.fn(), destroy: vi.fn() } as unknown as TodoActions}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Couldn’t show this")).toBeInTheDocument();
    quiet.mockRestore();
  });

  describe("notes", () => {
    const sample = [
      "## Plan",
      "Ship it with **bold** steps:",
      "- a",
      "- b",
      "See [link](https://example.com).",
    ].join("\n");

    const renderNotes = (
      notes: string | null,
      { column = false }: { column?: boolean } = {},
    ) => {
      const save = vi.fn();
      const onClose = vi.fn();
      const container = document.createElement("div");
      document.body.appendChild(container);
      const view = render(
        <DetailSheet
          todo={makeTodo({ notes })}
          subtasks={[]}
          listTargets={[]}
          listName={() => "Today"}
          listInSentence={() => "today"}
          timeZone="UTC"
          actions={{ save, destroy: vi.fn() } as unknown as TodoActions}
          onClose={onClose}
          {...(column && { variant: "column", container, animated: false })}
        />,
      );
      const rendered = () =>
        document.querySelector<HTMLElement>("[data-notes-rendered]");
      const editor = () =>
        screen.queryByRole("textbox", {
          name: "Notes",
        }) as HTMLTextAreaElement | null;
      return { save, onClose, rendered, editor, view, container };
    };

    for (const column of [false, true]) {
      const layout = column ? "on the wide board" : "in the phone sheet";

      it(`draws Markdown while they aren't being edited, ${layout}`, () => {
        const { rendered } = renderNotes(sample, { column });
        const notes = rendered();
        expect(notes).not.toBeNull();
        if (!notes) return;
        expect(notes.tagName).not.toBe("TEXTAREA");
        expect(
          within(notes).getByRole("heading", { name: "Plan" }),
        ).toBeInTheDocument();
        expect(within(notes).getByText("bold").tagName).toBe("STRONG");
        const items = within(notes).getAllByRole("listitem");
        expect(items.map((li) => li.textContent)).toEqual(["a", "b"]);
        expect(items[0].parentElement?.tagName).toBe("UL");
        expect(
          within(notes).getByRole("link", { name: "link" }),
        ).toHaveAttribute("href", "https://example.com/");
      });
    }

    it("edits the exact stored text on a click, and draws it again on blur", () => {
      const { rendered, editor } = renderNotes(sample);
      const notes = rendered();
      if (!notes) throw new Error("not rendered");
      fireEvent.click(within(notes).getByText("bold"));
      const field = editor();
      expect(field?.tagName).toBe("TEXTAREA");
      expect(field?.value).toBe(sample);
      expect(field).toHaveFocus();
      expect(field?.selectionStart).toBe(sample.length);
      expect(rendered()).toBeNull();

      if (field) fireEvent.blur(field);
      expect(rendered()?.querySelector("strong")?.textContent).toBe("bold");
      expect(
        document.querySelector("textarea[placeholder='Add notes']"),
      ).toBeNull();
    });

    it("opens a link in a new tab without starting to edit", () => {
      const { rendered } = renderNotes(sample);
      const link = screen.getByRole("link", { name: "link" });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      fireEvent.click(link);
      expect(rendered()).not.toBeNull();
      expect(
        document.querySelector("textarea[placeholder='Add notes']"),
      ).toBeNull();
    });

    it("never draws raw HTML or a javascript: link", () => {
      const notes = [
        '<img src=x onerror="alert(1)">',
        "<script>alert(1)</script>",
        "[x](javascript:alert(1))",
        '<a href="javascript:alert(1)">y</a>',
      ].join("\n");
      const { rendered } = renderNotes(notes);
      const view = rendered();
      if (!view) throw new Error("not rendered");
      expect(view.querySelector("img, script, a, iframe")).toBeNull();
      expect(view.querySelector("[href], [onerror], [src]")).toBeNull();
      expect(view.textContent).toContain('<img src=x onerror="alert(1)">');
      expect(view.textContent).toContain("[x](javascript:alert(1))");
    });

    it("edits on Return, and Esc saves and leaves the editor, not the sheet", () => {
      const { rendered, editor, save, onClose } = renderNotes("- a", {
        column: true,
      });
      const notes = rendered();
      if (!notes) throw new Error("not rendered");
      notes.focus();
      fireEvent.keyDown(notes, { key: "Enter" });
      const field = editor();
      expect(field).toHaveFocus();
      if (!field) return;
      fireEvent.change(field, { target: { value: "- a\n- **b**" } });
      fireEvent.keyDown(field, { key: "Escape" });
      expect(save).toHaveBeenCalledWith(expect.any(String), {
        notes: "- a\n- **b**",
      });
      expect(onClose).not.toHaveBeenCalled();
      const after = rendered();
      expect(after).toHaveFocus();
      expect(after?.querySelector("strong")?.textContent).toBe("b");
    });

    describe("code blocks", () => {
      const withCode = [
        "Run this:",
        "",
        "```sh",
        'while true; do printf "%s\\n" "$(date +%T)"; sleep 60; done',
        "```",
        "",
        "```",
        "second",
        "```",
      ].join("\n");

      const clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
      afterEach(() => {
        if (clipboard) Object.defineProperty(navigator, "clipboard", clipboard);
        else Reflect.deleteProperty(navigator, "clipboard");
        vi.restoreAllMocks();
      });

      const stubClipboard = (writeText: (text: string) => Promise<void>) =>
        Object.defineProperty(navigator, "clipboard", {
          value: { writeText: vi.fn(writeText) },
          configurable: true,
        });

      it("offers a copy button on each code block, hidden until hover or focus", () => {
        const { rendered } = renderNotes(withCode, { column: true });
        const notes = rendered();
        if (!notes) throw new Error("not rendered");
        const buttons = within(notes).getAllByRole("button", {
          name: "Copy code",
        });
        expect(buttons).toHaveLength(2);
        for (const button of buttons) {
          // Over the block, not beside it, and only on hover or focus.
          expect(button.className).toMatch(/\babsolute\b/);
          expect(button.className).toMatch(/\bopacity-0\b/);
          expect(button.className).toContain("group-hover/code:opacity-100");
          expect(button.className).toContain("focus-visible:opacity-100");
          expect(button.closest(".group\\/code")).not.toBeNull();
          expect(button.tabIndex).not.toBe(-1);
        }
      });

      it("copies the code block's text without starting to edit", async () => {
        stubClipboard(() => Promise.resolve());
        const { rendered } = renderNotes(withCode);
        const notes = rendered();
        if (!notes) throw new Error("not rendered");
        const [first, second] = within(notes).getAllByRole("button", {
          name: "Copy code",
        });
        await act(async () => {
          fireEvent.click(first);
        });
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
          'while true; do printf "%s\\n" "$(date +%T)"; sleep 60; done',
        );
        expect(rendered()).not.toBeNull();
        expect(
          document.querySelector("textarea[placeholder='Add notes']"),
        ).toBeNull();
        expect(await screen.findByText("Copied")).toBeInTheDocument();

        await act(async () => {
          fireEvent.click(second);
        });
        expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
          "second",
        );
      });

      it("doesn't start editing when the tooltip is clicked", async () => {
        stubClipboard(() => Promise.resolve());
        const { rendered } = renderNotes(withCode);
        const notes = rendered();
        if (!notes) throw new Error("not rendered");
        const [first] = within(notes).getAllByRole("button", {
          name: "Copy code",
        });
        await act(async () => {
          fireEvent.click(first);
        });
        const tooltip = await screen.findByText("Copied");
        expect(notes.contains(tooltip)).toBe(false);
        fireEvent.click(tooltip);
        expect(rendered()).not.toBeNull();
        expect(
          document.querySelector("textarea[placeholder='Add notes']"),
        ).toBeNull();
      });

      it("says so, and doesn't say Copied, when the copy fails", async () => {
        stubClipboard(() => Promise.reject(new Error("Denied")));
        const error = vi.spyOn(toast, "error");
        const { rendered } = renderNotes(withCode);
        const notes = rendered();
        if (!notes) throw new Error("not rendered");
        const [first] = within(notes).getAllByRole("button", {
          name: "Copy code",
        });
        await act(async () => {
          fireEvent.click(first);
        });
        expect(error).toHaveBeenCalledWith("Couldn’t copy");
        expect(screen.queryByText("Copied")).toBeNull();
      });
    });

    it("stops at the notes limit, says so once, and counts near it", () => {
      const info = vi.spyOn(toast, "info").mockImplementation(() => "");
      const { editor, save } = renderNotes(null);
      const field = editor();
      if (!field) throw new Error("no editor");
      expect(field).toHaveAttribute("maxLength", String(TODO_NOTES_MAX));
      fireEvent.focus(field);

      fireEvent.change(field, { target: { value: "a".repeat(89_999) } });
      expect(screen.queryByText(/\/ 100,000$/)).toBeNull();
      fireEvent.change(field, { target: { value: "a".repeat(90_000) } });
      const count = screen.getByText("90,000 / 100,000");
      expect(field).toHaveAttribute("aria-describedby", count.id);
      expect(info).not.toHaveBeenCalled();

      const full = "a".repeat(TODO_NOTES_MAX);
      fireEvent.change(field, { target: { value: full } });
      fireEvent.change(field, { target: { value: `${full.slice(1)}b` } });
      expect(info).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith(
        "Notes can be up to 100,000 characters",
      );
      expect(screen.getByText("100,000 / 100,000")).toBeInTheDocument();

      fireEvent.blur(field);
      expect(save).toHaveBeenCalledWith(expect.any(String), {
        notes: `${full.slice(1)}b`,
      });
      // Drawn, not edited: no count.
      expect(screen.queryByText(/\/ 100,000$/)).toBeNull();
      info.mockRestore();
    });

    for (const column of [false, true]) {
      const layout = column ? "on the wide board" : "in the phone sheet";

      it(`draws code smaller than the text around it, ${layout}`, () => {
        const { rendered } = renderNotes(
          "Run `ls` here:\n\n```\nwhile true; do date; done\n```",
          { column },
        );
        const notes = rendered();
        if (!notes) throw new Error("not rendered");
        const inline = within(notes).getByText("ls");
        expect(inline.tagName).toBe("CODE");
        expect(inline).toHaveClass("n-code");
        const pre = notes.querySelector("pre");
        expect(pre).toHaveClass("n-code");
        // Only the block is scaled, not its code again.
        expect(pre?.querySelector("code")).not.toHaveClass("n-code");
      });
    }

    describe("formatting shortcuts", () => {
      const platform = (name: string) =>
        vi.spyOn(navigator, "platform", "get").mockReturnValue(name);
      beforeEach(() => {
        platform("MacIntel");
      });
      afterEach(() => {
        vi.restoreAllMocks();
      });

      const editing = (notes: string, column = false) => {
        const view = renderNotes(notes, { column });
        const shown = view.rendered();
        if (shown) fireEvent.click(shown);
        const field = view.editor();
        if (!field) throw new Error("no editor");
        fireEvent.focus(field);
        return { ...view, field };
      };
      const select = (field: HTMLTextAreaElement, text: string) => {
        const at = field.value.indexOf(text);
        field.setSelectionRange(at, at + text.length);
      };
      const selected = (field: HTMLTextAreaElement) =>
        field.value.slice(field.selectionStart, field.selectionEnd);

      for (const column of [false, true]) {
        const layout = column ? "on the wide board" : "in the phone sheet";

        it(`wraps and unwraps with ⌘B, ⌘I and ⌘E, ${layout}`, () => {
          const { field } = editing("Very Fancy chair", column);
          select(field, "Fancy");
          expect(fireEvent.keyDown(field, { key: "b", metaKey: true })).toBe(
            false,
          );
          expect(field.value).toBe("Very **Fancy** chair");
          expect(selected(field)).toBe("Fancy");
          fireEvent.keyDown(field, { key: "b", metaKey: true });
          expect(field.value).toBe("Very Fancy chair");

          fireEvent.keyDown(field, { key: "i", metaKey: true });
          expect(field.value).toBe("Very *Fancy* chair");
          fireEvent.keyDown(field, { key: "i", metaKey: true });
          fireEvent.keyDown(field, { key: "e", metaKey: true });
          expect(field.value).toBe("Very `Fancy` chair");
          expect(selected(field)).toBe("Fancy");
        });
      }

      it("leaves Ctrl+B and Ctrl+E to the text field on a Mac", () => {
        const { field } = editing("Very Fancy chair");
        select(field, "Fancy");
        for (const key of "bie") {
          expect(fireEvent.keyDown(field, { key, ctrlKey: true })).toBe(true);
          expect(
            fireEvent.keyDown(field, { key, metaKey: true, ctrlKey: true }),
          ).toBe(true);
        }
        expect(field.value).toBe("Very Fancy chair");
      });

      it("uses Ctrl, not the Windows key, off a Mac", () => {
        platform("Win32");
        const { field } = editing("Very Fancy chair");
        select(field, "Fancy");
        expect(fireEvent.keyDown(field, { key: "b", metaKey: true })).toBe(
          true,
        );
        expect(field.value).toBe("Very Fancy chair");
        expect(fireEvent.keyDown(field, { key: "b", ctrlKey: true })).toBe(
          false,
        );
        expect(field.value).toBe("Very **Fancy** chair");
      });

      it("inserts the pair at the caret, with the caret between", () => {
        const { field } = editing("");
        fireEvent.keyDown(field, { key: "b", metaKey: true });
        expect(field.value).toBe("****");
        expect(field.selectionStart).toBe(2);
        expect(field.selectionEnd).toBe(2);
        // Caps Lock doesn't change it, and italic in empty bold is both.
        fireEvent.keyDown(field, { key: "I", metaKey: true });
        expect(field.value).toBe("******");
        expect(field.selectionStart).toBe(3);
      });

      it("doesn't strip bold with ⌘I", () => {
        const { field } = editing("**bold**");
        select(field, "bold");
        fireEvent.keyDown(field, { key: "i", metaKey: true });
        expect(field.value).toBe("***bold***");
      });

      it("saves the formatted text like typing", () => {
        const { field, save } = editing("Very Fancy chair");
        select(field, "Fancy");
        fireEvent.keyDown(field, { key: "e", metaKey: true });
        fireEvent.blur(field);
        expect(save).toHaveBeenCalledWith(expect.any(String), {
          notes: "Very `Fancy` chair",
        });
      });

      it("changes nothing when wrapping would pass the limit", () => {
        const full = "a".repeat(TODO_NOTES_MAX - 3);
        const { field } = editing(full);
        field.setSelectionRange(0, 1);
        expect(fireEvent.keyDown(field, { key: "b", metaKey: true })).toBe(
          false,
        );
        expect(field.value).toBe(full);
        fireEvent.keyDown(field, { key: "i", metaKey: true });
        expect(field.value).toBe(`*a*${full.slice(1)}`);
      });

      it("takes no other ⌘ letter, and leaves ⌘K to Search and commands", () => {
        const { field } = editing("Very Fancy chair");
        select(field, "Fancy");
        for (const key of "acdfghjklmnopqrstuvwxyz") {
          for (const mod of [{ metaKey: true }, { ctrlKey: true }]) {
            expect(fireEvent.keyDown(field, { key, ...mod })).toBe(true);
          }
        }
        // Shift and Option change the meaning: ⌘⇧B isn't bold.
        expect(
          fireEvent.keyDown(field, { key: "b", metaKey: true, shiftKey: true }),
        ).toBe(true);
        expect(
          fireEvent.keyDown(field, { key: "b", metaKey: true, altKey: true }),
        ).toBe(true);
        expect(field.value).toBe("Very Fancy chair");
      });
    });

    it("saves exactly the Markdown typed", () => {
      const { editor, save } = renderNotes(null);
      const field = editor();
      if (!field) throw new Error("no editor");
      const typed = "# Heading\n\n- [ ] *one*  \n  - two\n";
      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: typed } });
      // Still the editor while typing, though the notes aren't empty now.
      expect(editor()).toBe(field);
      fireEvent.blur(field);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(expect.any(String), { notes: typed });
    });

    it("shows Add notes when empty, and edits on focus", () => {
      const { editor, rendered } = renderNotes(null);
      expect(rendered()).toBeNull();
      const field = editor();
      expect(field).toHaveAttribute("placeholder", "Add notes");
      field?.focus();
      expect(field).toHaveFocus();
      expect(editor()).toBe(field);
    });
  });
});

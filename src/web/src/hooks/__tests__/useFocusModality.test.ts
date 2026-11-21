import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { KEY_FOCUS_ATTRIBUTE, useFocusModality } from "../useFocusModality";

describe("useFocusModality", () => {
  const root = document.documentElement;
  let field: HTMLTextAreaElement;
  let button: HTMLButtonElement;

  function setUp() {
    field = document.createElement("textarea");
    button = document.createElement("button");
    document.body.appendChild(field);
    document.body.appendChild(button);
    return renderHook(() => useFocusModality());
  }

  afterEach(() => {
    field.remove();
    button.remove();
    root.removeAttribute(KEY_FOCUS_ATTRIBUTE);
  });

  it("marks <html> when focus arrives after a key press", () => {
    setUp();
    fireEvent.keyDown(window, { key: "Tab" });
    field.focus();
    expect(root).toHaveAttribute(KEY_FOCUS_ATTRIBUTE);
  });

  it("clears it when focus arrives after a pointer press", () => {
    setUp();
    fireEvent.keyDown(window, { key: "Tab" });
    button.focus();
    expect(root).toHaveAttribute(KEY_FOCUS_ATTRIBUTE);
    fireEvent.pointerDown(field);
    field.focus();
    expect(root).not.toHaveAttribute(KEY_FOCUS_ATTRIBUTE);
  });

  it("clears it on a click into the field that already has focus", () => {
    setUp();
    fireEvent.keyDown(window, { key: "Tab" });
    field.focus();
    fireEvent.pointerDown(field);
    expect(root).not.toHaveAttribute(KEY_FOCUS_ATTRIBUTE);
  });

  it("doesn't add it while typing into a field that was clicked", () => {
    setUp();
    fireEvent.pointerDown(field);
    field.focus();
    fireEvent.keyDown(field, { key: "a" });
    fireEvent.keyDown(field, { key: "b" });
    expect(root).not.toHaveAttribute(KEY_FOCUS_ATTRIBUTE);
  });

  it("ignores a modifier pressed alone", () => {
    setUp();
    fireEvent.pointerDown(button);
    fireEvent.keyDown(window, { key: "Shift" });
    field.focus();
    expect(root).not.toHaveAttribute(KEY_FOCUS_ATTRIBUTE);
  });

  it("removes it on unmount", () => {
    const { unmount } = setUp();
    fireEvent.keyDown(window, { key: "Tab" });
    field.focus();
    unmount();
    expect(root).not.toHaveAttribute(KEY_FOCUS_ATTRIBUTE);
  });
});

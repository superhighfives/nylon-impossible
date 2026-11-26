// @vitest-environment node
// The repo's GitHub issue forms (#850), which Settings' Report a problem
// opens the chooser for. GitHub only shows them once they're on main, and
// drops a form it can't read, so this checks the shape it requires and the
// copy reporters see.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const DIR = join(import.meta.dirname, "../../../../../.github/ISSUE_TEMPLATE");

type Field = {
  type: string;
  id?: string;
  attributes: {
    label?: string;
    value?: string;
    description?: string;
    multiple?: boolean;
    options?: string[];
  };
  validations?: { required?: boolean };
};
type Form = {
  name: string;
  description: string;
  labels?: string[];
  body: Field[];
};

const read = (file: string) => parse(readFileSync(join(DIR, file), "utf8"));
const PUBLIC_NOTE =
  "Issues are public. Leave out anything private, like your email or the text of your todos.";
const TYPES = ["markdown", "textarea", "input", "dropdown", "checkboxes"];

/** Each field as [label, required], the public note as ["note", false]. */
const fields = (form: Form) =>
  form.body.map((field) =>
    field.type === "markdown"
      ? ["note", false]
      : [field.attributes.label, field.validations?.required ?? false],
  );

describe.each(["problem.yml", "idea.yml"])("%s", (file) => {
  const form = read(file) as Form;

  it("has the keys GitHub requires", () => {
    expect(typeof form.name).toBe("string");
    expect(typeof form.description).toBe("string");
    expect(form.body.length).toBeGreaterThan(0);
    const ids = form.body.flatMap((field) => (field.id ? [field.id] : []));
    expect(new Set(ids).size).toBe(ids.length);
    for (const field of form.body) {
      expect(TYPES).toContain(field.type);
      if (field.type === "markdown") {
        expect(field.attributes.value).toBeTruthy();
      } else {
        expect(field.id).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(field.attributes.label).toBeTruthy();
      }
    }
  });

  it("opens with the public note and never says task", () => {
    expect(form.body[0]).toEqual({
      type: "markdown",
      attributes: { value: PUBLIC_NOTE },
    });
    expect(JSON.stringify(form)).not.toMatch(/\btasks?\b/i);
  });
});

describe("Report a problem", () => {
  const form = read("problem.yml") as Form;

  it("is labelled feedback, so triage picks it up", () => {
    expect(form.name).toBe("Report a problem");
    expect(form.description).toBe(
      "Something in Nylon isn't working as it should.",
    );
    expect(form.labels).toEqual(["feedback"]);
  });

  it("asks what happened, what was expected, where, the steps and screenshots", () => {
    expect(fields(form)).toEqual([
      ["note", false],
      ["What happened?", true],
      ["What did you expect?", true],
      ["Where?", true],
      ["Steps to make it happen again", false],
      ["Screenshots", false],
    ]);
    const where = form.body.find((field) => field.id === "where");
    expect(where?.type).toBe("dropdown");
    expect(where?.attributes.multiple).toBe(true);
    expect(where?.attributes.options).toEqual([
      "Web",
      "iPhone",
      "Mac menu bar",
      "Gmail",
    ]);
    expect(
      form.body.find((field) => field.id === "screenshots")?.attributes
        .description,
    ).toBe("Paste or drag images here.");
  });
});

describe("Suggest an idea", () => {
  const form = read("idea.yml") as Form;

  it("has no label, and asks what and why", () => {
    expect(form.name).toBe("Suggest an idea");
    expect(form.description).toBe("Something you'd like Nylon to do.");
    expect(form.labels).toBeUndefined();
    expect(fields(form)).toEqual([
      ["note", false],
      ["What would you like Nylon to do?", true],
      ["Why would it help you?", false],
    ]);
  });
});

describe("config.yml", () => {
  it("keeps blank issues and adds no contact links", () => {
    expect(read("config.yml")).toEqual({ blank_issues_enabled: true });
  });
});

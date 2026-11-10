---
name: prd
description: How to write and argue a spec (PRD) for nylon-impossible, the template every issue body follows, and when it's ready to build. Use when asked to spec, draft, scope or write up an idea, issue or feature; when revising a spec after the owner's replies; when an issue has the `spec` or `needs-spec` label; or before moving anything to Ready on the Nylon board.
---

# Specs: argued until nothing is ambiguous

Agents build whatever a spec says, and quickly, so the spec is where the
quality comes from. Claude drafts every spec; the owner argues with it until
nothing in it is open. The arguing is the point, not the paperwork.

The foreman won't build an issue whose body is missing a section below, or
whose **Open questions** isn't exactly `None.`. It comments, adds
`needs-spec`, and moves the item back to Define
(`spec_problems` in `scripts/foreman/foreman.sh`, which matches these
headings exactly).

## The template

The spec is the issue body. Use these `##` headings, spelled as here.

**Every spec:**

```markdown
## Problem

What's wrong, for whom, and the evidence (a report, a screenshot, a Sentry
issue, a number).

## Acceptance criteria

- [ ] Each one checkable. Check: the test or screenshot that proves it.

## How to verify

Preview routes, `-NylonScreen` routes, and the steps to try it.

## Open questions

None.

## Decisions

- 2026-11-01: What was settled, and why.
```

**Features (`kind:feature`) also need:**

```markdown
## Outcome

What's true when it's done.

## Behaviour

Per platform: web wide, web phone, iPhone, iPad, Mac, menu bar, Gmail. Say
"unchanged" for the ones it doesn't touch.

## Non-goals

## Principles

Which of PRINCIPLES.md apply, and any tension with the Settled table.
```

Other sections (Setup, Background, a sketch of the approach) are welcome.
Keep the order roughly Problem, Outcome, Behaviour, Non-goals, Principles,
Acceptance criteria, How to verify, Open questions, Decisions.

## What makes a question open

A question is open when two careful builders could read the spec and build
different things, and the difference is something the owner would notice.
Ask the owner only about:

- user-visible behaviour, layout or copy the spec doesn't settle, on any
  platform, including one **Behaviour** doesn't mention;
- anything PRINCIPLES.md or its Settled table covers;
- deleting or rewriting user data;
- new paid services, cost or outside dependencies;
- guarded areas, a release, or what the foreman and agents may do.

If you're unsure whether something is user-visible, ask.

**Settle the rest yourself** (owner, 2026-11-10): naming, file layout,
whether to add a test and which kind, refactor scope inside the issue,
internal API shapes no client sees, the order of the work, and an acceptance
criterion's proof. Write the answer into the spec, and record it under
**Decisions** as `- YYYY-MM-DD (foreman): <what>, because <why>` so the owner
can see it and overrule it. A question the code, PRINCIPLES.md, CLAUDE.md or
an earlier decision already answers isn't open either: answer it in the spec
and say where the answer came from.

Ask each question so it can be answered in a line: number it, give the
options, and say which you'd pick and why. "Should completing a todo in
Gmail show Undo? Recommend no: the card can't (Settled table)." beats "What
about Undo?".

## Arguing

1. **Draft.** Write the whole template into the issue body, from what the
   owner wrote, the code and PRINCIPLES.md. List what you can't settle under
   **Open questions** and post them as one comment, numbered, with your
   recommendations.
2. **Revise** after each round of replies:
   - Settle each answered question: change the spec to match, then move the
     answer into **Decisions** as `- YYYY-MM-DD: <what was decided, and
     why>` and take it out of **Open questions**.
   - Ask anything the answers opened up. Push back when an answer conflicts
     with PRINCIPLES.md, the Settled table or another decision; say what it
     conflicts with.
   - Post a comment with what changed, what you settled yourself, and what's
     still open.
3. **Done** when **Open questions** reads exactly `None.`. Say so. The
   foreman moves it to Ready after its run; in a local session, move it
   yourself.

**The body is the truth.** The owner may edit the spec directly. Work from
their version, and don't revert or "tidy" what they wrote. If an edit seems
to contradict a decision, ask; don't pick.

**Where it happens:**
- **On the issue.** The foreman drafts and revises specs for issues labelled
  `spec` that are in Ideas or Define (the board may still show that column
  as "Specced" until the owner renames it). A new issue gets a draft; after
  that, each new comment from the owner starts a revision. It reads only the
  owner's, its own and `claude[bot]`'s comments.
- **From a draft.** The owner drags a draft card from Ideas to Define. The
  foreman turns it into an issue labelled `spec`, with the draft's text
  quoted under **Problem**, and drafts the spec from there. An owner's issue
  in Define without `spec` gets it too, and its draft rewrites the body into
  the template, keeping what was there under **Problem**.
- **The kind.** A draft of an issue with no `kind:*` label picks exactly one
  (`feature`, `fix`, `refactor`, `a11y`, `test` or `chore`) and writes the
  sections that kind needs. The foreman tells the run where to write its
  choice and adds the label; the owner can change it during the argument.
- **In a local session.** Argue in the session, then write the result back
  to the issue body (`gh issue edit <n> --body-file <file>`) and record the
  decisions there, so the issue stays the single source.

## Ready

A spec is ready, and goes to Ready, when:

- every required section is there, and **Open questions** is `None.`;
- each acceptance criterion names its proof, a test wherever one can show it;
- **How to verify** is concrete enough that the PR's **Try it** section can
  be written from it.

The foreman moves a spec to Ready when its run leaves it like that, and the
owner can move items too. It checks again before building, and sends back
anything that doesn't pass.

## Verifying

Tests and the review are the gate: an agent PR merges on green checks and a
🟢 `control-room-review` of its head commit (CLAUDE.md, "Merging"). So each
acceptance criterion's proof should be a test that fails without the change,
wherever one can be written; a shot covers what a test can't.

Every agent PR still gets a **Try it** section: the web preview URL, the
routes and steps, Apple before/after shots of the affected `-NylonScreen`
routes, and each acceptance criterion with the test or shot that shows it.
The owner reads it once the change is live, and what's wrong gets reverted
or fixed forward (CLAUDE.md, "Rolling back").

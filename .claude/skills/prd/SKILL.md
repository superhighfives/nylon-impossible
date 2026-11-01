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
`needs-spec`, and moves the item back to Specced
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
different things, and the difference would matter to the owner. In practice:

- a choice between behaviours, layouts, words or defaults the spec doesn't make;
- a platform the change could reach that **Behaviour** doesn't mention;
- an acceptance criterion that can't be checked, or names no test or shot;
- anything touching the Settled table, a migration, a release, or what the
  foreman and agents may do;
- a cost, risk or dependency the owner hasn't seen.

It isn't open when the code, PRINCIPLES.md, CLAUDE.md or an earlier decision
already answers it. Answer it in the spec and say where the answer came from.
Implementation details a reviewer would judge (names, file layout) aren't
questions either.

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
   - Post a comment with what changed and what's still open.
3. **Done** when **Open questions** reads exactly `None.`. Say so, and leave
   moving it to Ready to the owner.

**The body is the truth.** The owner may edit the spec directly. Work from
their version, and don't revert or "tidy" what they wrote. If an edit seems
to contradict a decision, ask; don't pick.

**Where it happens:**
- **On the issue.** The foreman drafts and revises specs for issues labelled
  `spec` that are in Ideas or Specced. A new issue gets a draft; after that,
  each new comment from the owner starts a revision. It reads only the
  owner's, its own and `claude[bot]`'s comments.
- **In a local session.** Argue in the session, then write the result back
  to the issue body (`gh issue edit <n> --body-file <file>`) and record the
  decisions there, so the issue stays the single source.

## Ready

Only the owner moves an item to Ready, for every kind, for now. That's the
owner saying the argument is over. Before then:

- every required section is there, and **Open questions** is `None.`;
- each acceptance criterion names its proof;
- **How to verify** is concrete enough that the PR's **Try it** section can
  be written from it.

## Verifying

Every agent PR gets a **Try it** section: the web preview URL, the routes and
steps, Apple before/after shots of the affected `-NylonScreen` routes, and
each acceptance criterion with the test or shot that shows it. The owner
tries it and adds `verified`. The foreman merges only with a `verified` the
owner added after the head commit was pushed; a later push clears it.

The plan is to drop `verified` for kinds where the tests are proof enough
(likely `test`, `chore`, `refactor`), one kind at a time, each with a written
reason in CLAUDE.md.

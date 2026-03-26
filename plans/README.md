# Plans

This directory contains project plans organized by status. Plans move through four stages: **backlog** → **ready** → **in-progress** → **done**.

## Directory Structure

```
plans/
├── backlog/     # Stubs and ideas not yet ready for work
├── ready/       # Fully specced plans ready for an agent to implement
├── in-progress/ # Plans currently being worked on
├── done/        # Completed work with full documentation
└── assets/      # Supporting files (images, diagrams, etc.)
```

## File Naming Convention

All plan files follow this format:

```
YYYY-MM-DD-descriptive-name.md
```

- **Date**: When the plan was created (ISO 8601 format)
- **Descriptive name**: Kebab-case description of the work
- **Extension**: Always `.md`

### Examples

- `2026-02-12-effect-integration.md`
- `2026-02-27-security-hardening.md`
- `2026-02-28-sentry-and-analytics.md`

## Stages

### Backlog

Location: `backlog/`

Short stubs capturing ideas that need more thought before implementation.

**Characteristics:**
- Brief descriptions (1-3 paragraphs)
- Problem statement or opportunity
- No implementation details yet
- May reference other plans or external resources

**When to move to ready:** When the problem is fully understood and the solution can be fully specified.

### Ready

Location: `ready/`

Fully specced plans that an agent can pick up and implement without further clarification.

**Characteristics:**
- Clear problem statement
- Detailed solution approach
- Specific files to modify or create
- Acceptance criteria
- Technical considerations
- Dependencies

**When to move to in-progress:** When you start implementing the plan.

### In Progress

Location: `in-progress/`

Plans actively being implemented.

**Characteristics:**
- Moved from `ready/` when work begins
- Status header updated to `In Progress`
- May include implementation notes as work progresses
- Helps track what's currently being worked on

**When to move to done:** When the work is implemented and tested.

### Done

Location: `done/`

Documentation of completed work.

**Characteristics:**
- Full implementation details
- Architecture decisions
- Code examples
- File references
- What was built and why
- Any deviations from the original ready spec

## Workflow

1. **Create** a stub in `backlog/` when you have an idea
2. **Flesh out** the backlog item into a full spec and move it to `ready/`
3. **Move to in-progress** when you start implementation
4. **Document** the completed work in `done/`

## Template

### Backlog Stub

```markdown
# Title

Brief description of the problem or opportunity.

Maybe a note about why this matters or what triggered the idea.
```

### Ready Spec

```markdown
# Title

**Date**: YYYY-MM-DD
**Status**: Ready

## Problem

Clear description of what needs to be solved.

## Solution

Detailed approach to solving the problem.

## Implementation

### Files to modify

- `path/to/file.ts` - what to change
- `path/to/new-file.ts` - what to create

### Key considerations

- Important constraint or requirement
- Another consideration

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Dependencies

- Blocked by: other-plan.md
- Related to: another-plan.md
```

### Done Documentation

```markdown
# Title

**Date**: YYYY-MM-DD
**Status**: Complete

## Overview

What was built and why.

## Architecture

### Key decisions

Explanation of important architectural choices.

## Files

| File | Purpose |
|------|---------|
| `src/...` | What it does |

## Key patterns

```typescript
// Example code showing important patterns
```

## Dependencies

```json
{ "package-name": "^version" }
```
```

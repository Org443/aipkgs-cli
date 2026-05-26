---
description: Generate terse caveman-style commit message
allowed-tools: Bash
allowed-commands:
  - git diff *
  - git status
  - git log *
---

## Context

- Staged diff: !`git diff --staged`
- Status: !`git status --short`

## Your Task

Generate a terse commit message for the current staged changes.

**Format:** Conventional Commits.

**Subject:**
- ≤50 chars, hard cap 72
- Imperative mood ("add", "fix", "remove")
- Lowercase after the type prefix
- No trailing period

**Body:** Only when the *why* isn't obvious from the subject. Why over what. Wrap at 72 chars. Skip entirely if the subject is self-explanatory.

$ARGUMENTS

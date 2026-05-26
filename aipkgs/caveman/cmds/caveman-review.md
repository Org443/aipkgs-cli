---
description: One-line code review comments
allowed-tools: Bash, Read
allowed-commands:
  - git diff *
  - git log *
  - git status
---

## Context

- Current branch: !`git branch --show-current`
- Diff vs origin: !`git diff origin/HEAD...HEAD`

## Your Task

Review the current code changes. **One line per finding.**

**Format:** `L<line>: <severity> <problem>. <fix>.`

**Severity:** `bug`, `risk`, `nit`, `q`.

Skip praise. Skip obvious. If code looks good, say `LGTM` and stop.

$ARGUMENTS

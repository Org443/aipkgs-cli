---
name: short-comments
description: Comments earn their line. Keep the why; remove the paraphrase.
type: rule
version: 0.1.0
---

# short-comments

## Rule

A comment is only worth keeping when it explains something the code itself
cannot — a hidden constraint, a workaround for a specific bug, a surprising
invariant, or the rationale behind a non-obvious choice.

## Strip

- Comments that paraphrase the next statement.
- Comments that describe what a well-named function or variable already says.
- "Added for ticket #1234" — that belongs in the commit, not the source.
- Multi-paragraph docstrings on internal helpers.

## Keep

- "Workaround for safari < 17 — see issue #842."
- "Indices must stay sorted; downstream binary search depends on it."
- "Runs under a lock held by `Repo#withConnection`, so this is safe to mutate."

## Notes

This rule applies to *new* comments written in a change. It does not require
removing existing comments unless the surrounding code is being touched.

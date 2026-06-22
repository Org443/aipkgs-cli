---
name: code-simplify
description: Simplifies modified code for readability and clarity
allowed-tools: Bash, Read, Write
allowed-commands:
  - git *
---

# Code Review

Lets go over code that has been changed. Use git to get the diff of the changes.

- Current branch: !`git branch --show-current`
- Changed files: !`git diff --name-only main...HEAD`
- Commits: !`git log --oneline main..HEAD`
- Changes: !`git --no-pager diff main...HEAD`

- We do NOT like lots of comments and we strongly prefer shorter comments if they are absolutely necessary.
- Constant variables that are used only once should be inlined into the use site.

We want to prioritize:

1. Readability
2. Clarity
3. Decouple
4. Unnecessary abstractions

$ARGUMENTS

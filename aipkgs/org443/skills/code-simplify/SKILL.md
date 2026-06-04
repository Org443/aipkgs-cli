---
name: code-simplify
description: Simplifies modified code for readability and clarity
allowed-tools: Bash, Read, Write
allowed-commands:
  - git *
---

# Code Review

Lets go over code that has been changed.  Use git to get the diff of the changes.

- We do NOT like lots of comments and we strongly prefer shorter comments if they are absolutely necessary.
- Constant variables that are used only once should be inlined into the use site.

We want to prioritize:
1. Readability
2. Clarity
3. Decouple
4. Unnecessary abstractions

$ARGUMENTS

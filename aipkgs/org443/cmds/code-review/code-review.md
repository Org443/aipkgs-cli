---
description: Reviews modified code applying the rules
allowed-tools: Bash, Read, Write
allowed-commands:
  - git *
---

## Context

- Current branch: !`git branch --show-current`

## Your Task

Follow these steps **in order**

### Step 1 — Get the change context from git

If the current branch is `main` or `master`, stop and tell the user: "You must be on a feature branch to create a PR. Please switch to the appropriate branch first."

### Step 2 — Build the diff context

Run `git diff origin/<BASE_BRANCH>...HEAD` to capture all changes introduced by this branch.

Also run `git log origin/<BASE_BRANCH>..HEAD --oneline` to see commit history.

### Step 3 - Aggressive apply the rules

Deploy a swarm of subagents to **Aggressively** audit using the users coding rules and any CLAUDE.md assertions.  Make sure to use any loaded `rule` sets.

Create a summary of the top 3 most impactful changes and present this to the user.

**Important** Await for the users approval of the changes

### Step 4 - Apply the changes

Apply the changes and catalog the touched files.  When finished create a summary of the changes.

$ARGUMENTS

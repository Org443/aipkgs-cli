---
name: pr-create
description: Create a GitHub PR from current branch
allowed-tools: Bash, Read, Write
allowed-commands:
  - git *
  - gh *
---

## Context

- Current branch: !`git branch --show-current`
- Git remote URL: !`git remote get-url origin`

## Your Task

Follow these steps **in order**, stopping immediately if any step fails.

### Step 1 — Verify branch

If the current branch is `main` or `master`, stop and tell the user: "You must be on a feature branch to create a PR. Please switch to the appropriate branch first."

### Step 2 — Detect base branch

Determine the base branch using these checks in order — use the first that returns a valid result:

1. **Configured upstream:** `git rev-parse --abbrev-ref @{upstream} 2>/dev/null | sed 's|^origin/||'`
   - Use this if it returns a branch name that is _not_ the current branch.
2. **Nearest branch in history:** `git show-branch -a 2>/dev/null | grep '\*' | grep -v "$(git branch --show-current)" | head -1 | sed 's/.*\[\(.*\)\].*/\1/' | sed 's/[\^~].*//'`
   - Use this if it returns a non-empty result.
3. **Fallback:** Use `main`.

Store this as `BASE_BRANCH` and use it in all subsequent steps. Tell the user: "Detected base branch: `<BASE_BRANCH>`"

### Step 3 — Pull latest from base branch

Run:

```
git fetch origin <BASE_BRANCH>
git merge origin/<BASE_BRANCH>
```

If the merge produces **conflicts**, stop immediately and tell the user:
"Merge conflicts detected. Please resolve conflicts manually before creating a PR."

List the conflicting files so the user knows what to fix.

Also tell the user they can abort the merge and return to their previous state by running:

```
git merge --abort
```

### Step 4 — Build the diff context

Run `git diff origin/<BASE_BRANCH>...HEAD` to capture all changes introduced by this branch.

Also run `git log origin/<BASE_BRANCH>..HEAD --oneline` to see commit history.

### Step 4 — Draft the PR message

Using the diff and commit history, write a concise PR message in this structure:

- Be concise, direct, and non-opinionated.  
- Avoid adjectives like "Best solution" or "superior flow".
- Don't make assumptions.

```
## Problem Description
<1-3 sentences on what problem or gap this addresses>

## Solution
<1-3 bullet points on what was changed and how it solves the problem>

## Notes
<Optional: gotchas, follow-up work, known limitations, or anything reviewers should know>

## Check List
<The following check-box enabled list, and any other check list items a dev would need to preform>
[] Deployed to DEV
[] Passing tests
```

Rules:

- Keep each section concise — no padding or filler
- Do NOT include local absolute file paths or `localhost` URLs
- When referencing files, use repo-relative paths as they appear in git (e.g. `scripts/utils/foobar.ts`), not absolute paths
- If referencing issues or PRs, use the full GitHub URL derived from the remote origin (e.g. `https://github.com/org/repo/issues/123`), not local paths


### Step 5 — Publish

1. Push the current branch to origin if not already pushed:

   ```
   git push -u origin <current-branch>
   ```

2. Create the PR using `gh pr create --base <BASE_BRANCH>` with the approved message body from `pr-draft.md`.

5. Return the PR URL to the user so they can access it directly.

$ARGUMENTS

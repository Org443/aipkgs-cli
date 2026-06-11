---
name: worktree
description: Create a fully-functional git worktree for a branch in an npm project. Use this whenever the user asks to create a worktree, work on a branch in parallel, spin up an isolated copy of the repo, or remove an existing worktree — even if they don't say the word "worktree" (e.g. "set me up to work on branch X without touching my current checkout").
allowed-tools: Bash, Read, Glob
allowed-commands:
  - git *
  - npm *
  - npx *
---

## Goal

Produce a worktree that behaves exactly like the checkout this skill was run from — not just the tracked files, but the full developer setup: same `.env` access, dependencies installed via `npm install`, and the `.claude/` setup recreated through AIpkgs. A worktree that compiles but can't reach the database is not done.

## Context

- Repo root: !`git rev-parse --show-toplevel`
- Current branch: !`git branch --show-current`

## Removing a worktree

If the user asks to remove/delete a worktree, run:

```
scripts/worktree <branch-name> -d
```

and stop there.

## Creating a worktree

Follow these steps in order.

### Step 1 — Run the worktree script

```
scripts/worktree <branch-name>
```

The script (run it from anywhere inside the repo):

- Places the worktree at `../<repo>.worktrees/<branch-name>` (a sibling of the repo, so it never pollutes the repo itself)
- Reuses the branch if it exists locally, otherwise creates it
- Copies all `.env*` files from the current working tree into the new worktree
- Runs `npm install` in the new worktree

If it reports the worktree already exists, tell the user the path and ask whether they want to use it as-is or remove and recreate it.

### Step 2 — Survey the developer setup

The script only knows about `.env*` files. Other gitignored files may be part of the working setup, so compare the two trees:

```
ls -la <repo-root>
ls -la <worktree-path>
```

Look for top-level files present in the source checkout but missing from the worktree. Things worth copying are typically small, local-only config that the developer needs to work — for example:

- `.env`, `.env.dev`, `.env.local` (already handled by the script — verify they arrived)
- `.npmrc` (private registry auth — without it `npm install` may have silently used the public registry)
- Local override configs like `docker-compose.override.yml`, `*.local.json`
- Certificates/keys referenced by `.env` (e.g. a `certs/` dir)

Do **not** copy:

- `node_modules/` — recreated by `npm install`; copying it is slow and breaks native modules
- `.claude/` — recreated by AIpkgs in Step 3; copying it can clobber the install
- Build output (`dist/`, `.next/`, coverage, caches) — regenerated on demand
- `.git` — worktrees share the repo's git data by design

When unsure whether a gitignored file is setup (copy) or artifact (skip), check whether anything in the project reads it — a file nothing references is an artifact.

### Step 3 — Recreate the AIpkgs setup

If the worktree contains an `aipkg.json`, run inside the worktree:

```
npx @aipkgs/cli install
```

This rebuilds the `.claude/` setup from the manifest — which is why `.claude/` must not be copied by hand in Step 2.

### Step 4 — Verify and report

Confirm the worktree is functional:

- `node_modules/` exists and `npm install` exited cleanly
- The `.env*` files match the source checkout
- `.claude/` exists if `aipkg.json` was present

Report visually — a table and a small ASCII diagram are easier to scan than prose:

- An ASCII diagram showing where the worktree sits relative to the repo:

  ```
  parent-dir/
  ├── my-repo/                  ← source checkout (main)
  └── my-repo.worktrees/
      └── feature-x/            ← new worktree (feature-x, created)
  ```

- A table of setup actions, one row per item:

  | Item         | Action            | Notes                          |
  |--------------|-------------------|--------------------------------|
  | `.env`       | copied            |                                |
  | `.env.dev`   | copied            |                                |
  | `.npmrc`     | copied            | private registry auth          |
  | node_modules | `npm install`     | exited cleanly                 |
  | `.claude/`   | `npx @aipkgs/cli install` | rebuilt from `aipkg.json` |
  | `data/`      | skipped           | 2.3 GB — copy manually if needed |

Include rows for anything deliberately skipped so the user can handle those themselves.

$ARGUMENTS

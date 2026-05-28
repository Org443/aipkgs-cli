---
name: import-aipkgs
description: >-
  Import skills, commands, subagents, rules, and hooks from an external git
  repository into this repo's aipkgs/ tree, packaged with the correct
  aipkg.json manifest, preserved LICENSE.txt, and a README.md so they can be
  published to the AIpkgs registry with `aipkg publish`. Use this whenever the
  user wants to vendor, import, pull in, mirror, package, or "add" a GitHub
  repo's Claude Code plugins / skills / commands / agents into aipkgs, when they
  point at a repo URL and ask to make it publishable, or when working through
  the backlog in todo.md. Triggers even when the user just says "package this
  repo for aipkgs" or names a project (superpowers, caveman, marketingskills…)
  without spelling out the steps.
---

# Import aipkgs

Turn an external git repository full of Claude Code assets (skills, slash
commands, subagents, rules, hooks) into one or more publishable AIpkgs
packages laid out under `aipkgs/<org>/`, validated against the CLI's archive
rules.

## Why this exists

The registry grows by vendoring good third-party repos into `aipkgs/<org>/`.
Each imported repo gets its own **org namespace** and is normally packaged as a
single **box** — the same shape as the already-imported `superpowers`,
`caveman`, and `gsd` orgs. The end state is a directory that
`aipkg publish` accepts without complaint, with upstream attribution and
license preserved.

The default packaging shape is **box-primary, standalone fallback**: bundle the
whole repo as one box, unless the repo contains exactly one asset, in which case
a standalone package is cleaner. See [references/packaging.md](references/packaging.md)
for the exact layouts, the full manifest schema, and the per-type file rules —
read it before writing any `aipkg.json`.

## Workflow

Work through these steps in order. Keep the user in the loop on the two
decisions that are easy to get wrong: the **org slug** and **box vs standalone**.

### 1. Get the source

If the user gave a git URL, clone it shallow to a scratch dir so you never edit
their working tree:

```sh
git clone --depth 1 <url> /tmp/import-<name>
```

If they pointed at a local path, read it in place. Either way, take a quick
inventory of the repo's top level before deciding anything — the layout tells
you what kind of repo it is.

### 2. Choose the org slug

Derive a lowercase org slug from the **project name** (not the GitHub owner):

- `obra/superpowers` → `superpowers`
- `JuliusBrussee/caveman` → `caveman`
- `coreyhaines31/marketingskills` → `marketingskills`

Org slugs must match `^[a-z0-9-_]+$` and be ≤ 30 chars. **Show the user the
derived slug and let them override before you create any files.** If
`aipkgs/<org>/` already exists, stop and ask — you may be re-importing or
colliding.

### 3. Discover the assets

Scan the repo for each asset type. Upstream layouts vary a lot (plugin repos,
`.claude/` dirs, bare `skills/` folders); the discovery heuristics for each are
in [references/source-layouts.md](references/source-layouts.md) — read it, because
two things bite on real repos: **commands may be `.toml`, not `.md`** (convert
them, don't drop them) and **the same asset may appear in two trees** (dedupe,
don't double-count). At minimum look for:

- **Skills** — any directory containing a `SKILL.md`.
- **Commands** — `*.md` under `commands/` or `.claude/commands/`.
- **Subagents** — `*.md` under `agents/` or `.claude/agents/`.
- **Rules** — `*.md` rule/instruction files (`rules/`, or split out of a CLAUDE.md).
- **Hooks** — a `hooks.json` (or hook config) plus its scripts.
- **MCP servers** — see step 8; these are config, not files.

Report what you found as a short inventory before packaging, e.g. "Found 14
skills, 3 commands, 1 hook, no rules." This is the moment to catch a repo whose
real content lives somewhere you didn't expect.

### 4. Decide box vs standalone

Default to a **box** when the repo has more than one asset, or is clearly a
cohesive collection (most plugin repos). Drop to a **standalone** package only
when there's exactly one asset and no reason to bundle. When unsure, prefer the
box — it matches precedent and is trivial to install as a unit. Confirm the
choice with the user if it's a close call.

### 5. Lay out the files

Create the directory under `aipkgs/<org>/` following the layout in
[references/packaging.md](references/packaging.md). The shapes that trip people up:

- In a **box**, commands/rules/subagents are **flat `*.md` files** directly under
  `cmds/`, `rules/`, `subagents/` — *not* in per-asset subdirs.
- In a **box**, skills keep their subdir: `skills/<slug>/SKILL.md` plus whatever
  assets/scripts/references the skill ships.
- Hooks live at `hooks/hooks.json` (one per box) alongside their scripts.

Sanitize every slug/filename to `^[a-z0-9-_]+$`, ≤ 30 chars. Copy skill resource
dirs (`assets/`, `scripts/`, `references/`) wholesale. Don't rewrite the asset
markdown — keep upstream frontmatter and content intact.

### 6. Write the manifest

Write `aipkg.json` at the box root (or in the standalone package dir). Use the
schema and field rules in [references/packaging.md](references/packaging.md). For a box
import, a minimal manifest is correct — the bundled files travel in the archive,
so you do **not** need to enumerate them under `deps`:

```json
{
  "type": "box",
  "ref": "<org>/<BoxName>",
  "version": "0.1.0",
  "description": "<one concise sentence about what the box bundles>",
  "homepage": "<upstream repo URL>",
  "repository": { "type": "git", "url": "<upstream .git URL>" }
}
```

`<BoxName>` is the Capitalized project name (`Superpowers`, `Caveman`, `GSD`).
Start fresh imports at `version` `0.1.0` unless the user says otherwise. Write a
description that says what the box *does*, not just what it contains.

### 7. Preserve license, write README

- **LICENSE** — copy the upstream `LICENSE`/`LICENSE.md`/`COPYING` to
  `LICENSE.txt` verbatim. If the repo has no license, **stop and ask the user** —
  do not invent one and do not publish unlicensed third-party code.
- **README.md** — write a short README for the package: what it is, that it was
  imported from `<upstream>`, attribution to the original author, and a one-line
  install hint. Don't blindly copy the upstream README; summarize and attribute.
- **HERO_CARD.md** — optional; only add if the user wants registry card copy.

### 8. Handle MCP servers (if any)

MCP servers aren't file-based packages — they're `url`/`command` entries under
`deps.mcps` in a consumer's `aipkg.json`. If the repo *is* an MCP server, don't
package files; instead emit the command the user would run to wire it up, e.g.:

```sh
aipkg mcp add <slug> --url https://example.com/mcp
# or, for a stdio server:
aipkg mcp add <slug> --command npx --arg -y --arg some-mcp-server
```

Tell the user what you found and hand them the exact command rather than editing
their manifest unprompted.

### 9. Validate

Validate the package the same way the registry will, without uploading. Point
the command at the directory that **contains the `aipkg.json` you wrote**, using
an **absolute** path:

- **Box import:** `aipkgs/<org>` (the box root).
- **Standalone import:** the package dir, e.g. `aipkgs/<org>/skills/<slug>` (or
  `cmds/<slug>`, `rules/<slug>`, …) — one or two levels deeper than the org root.

You're working inside the aipkgs-cli repo, so run the CLI from local source —
this is the version of record and supports `--dry`:

```sh
node --experimental-strip-types packages/cli/src/index.ts publish --dry "$(pwd)/aipkgs/<org>"
```

(run from the repo root). Don't use `npm run dev` (it runs from `packages/cli`,
so relative paths break, and npm swallows the `--dry` flag). Note that a
released `npx @aipkgs/cli` may lag the local source and lack `--dry` — prefer the
local-source command above while in this repo. Read the "Archive contents" list
it prints and confirm every expected file is there and nothing stray is. Fix any
`InvalidArchive` / `InvalidManifest` error before declaring success — common
causes are listed in [references/packaging.md](references/packaging.md#troubleshooting).
Never claim the import is publishable until a `--dry` run has succeeded.

### 10. Report

Summarize: the org created, the package type, the asset inventory, the license
found, and the exact publish command the user can run next. Use the same path
you validated — the box root for a box, or the package dir for a standalone:

```sh
aipkg publish aipkgs/<org>                    # box
aipkg publish aipkgs/<org>/skills/<slug>      # standalone (adjust type/slug)
```

If you handled MCP servers, restate the `aipkg mcp add` command(s) too.

## Guardrails

- Never edit the user's source repo or their root `aipkg.json`/`aipkg.lock`
  during an import — you only create files under `aipkgs/<org>/`.
- Don't run `aipkg publish` (the real upload) yourself; that's the user's call.
  Stop at `--dry` validation and hand them the command.
- Preserve upstream content and licensing faithfully. When attribution or
  license is missing or ambiguous, ask rather than guess.

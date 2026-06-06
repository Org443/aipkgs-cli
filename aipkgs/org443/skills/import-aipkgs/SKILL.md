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
commands, subagents, rules, hooks) into publishable AIpkgs packages under
`aipkgs/<org>/`, validated against the CLI's archive rules.

## Why this exists

The registry grows by vendoring good third-party repos into `aipkgs/<org>/`,
each in its own **org namespace**, with upstream attribution and license
preserved. The end state is a tree that `aipkg publish` accepts without complaint.

**Default shape: split + box-of-deps.** Publish every asset as its own
standalone package (own `aipkg.json` + `LICENSE.txt`) so each installs on its
own, then add one **box** that bundles them by *referencing* them as `deps` —
not by packaging their files. The box manifest lives in a `box/` subdir so its
archive collector never sweeps the sibling assets. A repo with exactly one asset
skips the box. (Older imports like `superpowers` and `caveman` bundled
everything into a single box; prefer the split model for new imports — users can
install one skill, and the box can express inter-asset dependencies.)

See [references/packaging.md](references/packaging.md) for the manifest schema,
layouts, and per-type file rules — read it before writing any `aipkg.json`.

## Workflow

Keep the user in the loop on the decision that's easy to get wrong: the **org slug**.

### 1. Get the source

If given a git URL, clone shallow to a scratch dir so you never edit their tree:
`git clone --depth 1 <url> /tmp/import-<name>`. If a local path, read in place.
Either way, inventory the repo's top level first — the layout tells you what
kind of repo it is.

### 2. Choose the org slug

Derive a lowercase slug from the **project name** (not the GitHub owner):
`obra/superpowers` → `superpowers`, `JuliusBrussee/caveman` → `caveman`. Must
match `^[a-z0-9-_]+$`, ≤ 30 chars. **Show the user the slug and let them override
before creating files.** If `aipkgs/<org>/` already exists, stop and ask — you
may be re-importing or colliding.

### 3. Discover the assets

Scan for each asset type (heuristics in
[references/source-layouts.md](references/source-layouts.md) — read it; two things
bite: **commands may be `.toml`, not `.md`** (convert, don't drop) and **the same
asset may appear in two trees** (dedupe)):

- **Skills** — any dir with a `SKILL.md`.  **Commands** — `*.md` under `commands/` or `.claude/commands/`.
- **Subagents** — `*.md` under `agents/`.  **Rules** — `*.md` rule files (or split out of CLAUDE.md).
- **Setups** — a `setup.json` (hooks / status line) plus a `scripts/` payload.  **MCP servers** — see step 7; config, not files.

Report a short inventory before packaging (e.g. "14 skills, 3 commands, 1 hook").

Then **analyze the assets for dependencies within the org namespace**: read them
for places where one asset invokes, requires, or chains to another (`/other-skill`,
"run X then Y", reading another asset's file). On a large set, fan out parallel
agents to map it. Record the **tightly-coupled** edges — the ones an asset needs
to actually run — to encode as deps in step 5. This is the gstack analysis:
`autoplan` drives the four `plan-*-review` skills, `guard` combines `careful` +
`freeze`, `ios-fix` consumes `ios-qa`.

### 4. Lay out the files

Give every asset its own package dir, and put the box in its own subdir:

```
aipkgs/<org>/
├── box/                  # type: box — manifest + README.md + LICENSE.txt only
├── skills/<slug>/        # aipkg.json + SKILL.md + assets/scripts/references + LICENSE.txt
├── cmds/<slug>/          # aipkg.json + <slug>.md  (strict: no other files)
├── rules/<slug>/         # aipkg.json + <slug>.md
├── subagents/<slug>/     # aipkg.json + <slug>.md
└── setups/<slug>/        # aipkg.json + setup.json + scripts/
```

Each asset is a standalone package; the box under `box/` ships only its own
sidecars. Copy skill resource dirs wholesale; don't rewrite asset markdown.
Sanitize slugs to `^[a-z0-9-_]+$`, ≤ 30 chars. (Single-asset repo → just the one
standalone dir, no box.)

### 5. Write the manifests

One manifest per asset dir, plus one in `box/`. Start all at `version` `0.1.0`.
Standalone asset:

```json
{ "type": "skill", "ref": "<org>/<slug>", "version": "0.1.0", "description": "<from the asset>" }
```

The box references every asset as a dep — one bucket per type (`skills`, `cmds`,
`subagents`, `rules`, `setups`), alias → `aipkg://<type>/<org>/<slug>@latest`:

```json
{
  "type": "box",
  "ref": "<org>/<BoxName>",
  "version": "0.1.0",
  "description": "<what the box does>",
  "homepage": "<upstream URL>",
  "repository": { "type": "git", "url": "<upstream .git URL>" },
  "deps": { "skills": { "<slug>": "aipkg://skill/<org>/<slug>@latest" } }
}
```

`<BoxName>` is the Capitalized project name (`Antfu`, `Gstack`). **Encode the
tightly-coupled edges you mapped in step 3 in each asset's own manifest**: list a
dependency under the dependent asset's own `deps`, same `aipkg://…` ref format —
e.g. `skills/autoplan/aipkg.json` lists the four `plan-*-review` skills it drives,
so installing it pulls them in. Encode only real "needs to run" edges, not
topical or downstream-suggestion mentions.

### 6. Preserve license, write README

- **LICENSE** — copy upstream `LICENSE`/`COPYING` to `LICENSE.txt` verbatim, into
  the box dir **and each standalone asset dir** (each ships on its own). No
  license → stop and ask; don't publish unlicensed third-party code.
- **README.md** — short, at the box root: what it is, imported from `<upstream>`,
  attribution, one-line install hint. Don't copy the upstream README wholesale.

### 7. Handle MCP servers (if any)

MCP servers aren't file-based — they're `deps.mcps` entries in a consumer's
manifest. If the repo *is* an MCP server, don't package files; hand the user the
wiring command instead of editing their manifest:

```sh
aipkg mcp add <slug> --url https://example.com/mcp   # or --command npx --arg -y --arg <server>
```

### 8. Validate

Validate **each asset dir and the box**, absolute paths, from local source (the
released `npx @aipkgs/cli` may lag and lack `--dry`; don't use `npm run dev` —
relative paths break and npm swallows `--dry`):

```sh
node --experimental-strip-types packages/cli/src/index.ts publish --dry "$(pwd)/aipkgs/<org>/skills/<slug>"
node --experimental-strip-types packages/cli/src/index.ts publish --dry "$(pwd)/aipkgs/<org>/box"
```

The box's "Archive contents" should list only its own sidecars — that confirms
it references rather than bundles the assets. Fix any
`InvalidArchive`/`InvalidManifest` (causes in
[references/packaging.md](references/packaging.md#troubleshooting)) before
claiming success.

### 9. Report

Summarize org, asset inventory, and license. **Publish order matters: deps
before dependents, box last** — its `@latest` deps must already resolve. Safe
order: assets with no deps first, then the rest, then the box.

```sh
aipkg publish aipkgs/<org>/skills/<slug>   # each asset
aipkg publish aipkgs/<org>/box             # box, last
```

## Guardrails

- Never edit the user's source repo or their root `aipkg.json`/`aipkg.lock` —
  only create files under `aipkgs/<org>/`.
- Don't run `aipkg publish` (the real upload) yourself; stop at `--dry` and hand
  the user the command.
- Preserve upstream content and licensing faithfully. When license or
  attribution is missing or ambiguous, ask rather than guess.

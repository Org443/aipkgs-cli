# Packaging reference

Everything you need to lay out files and write a valid `aipkg.json`. The CLI's
archive validator (`packages/archive/src/validate/*`) enforces these rules at
publish time, so matching them here is what makes the dry-run publish pass.

Validate from the repo root with an absolute path, pointing at the dir that
holds the `aipkg.json` you wrote (box root for a box; the package dir for a
standalone). Run from local source while in this repo — a released
`npx @aipkgs/cli` may lag and lack `--dry`:

```sh
node --experimental-strip-types packages/cli/src/index.ts publish --dry "$(pwd)/aipkgs/<org>"
# standalone: ... "$(pwd)/aipkgs/<org>/skills/<slug>"
```

## Contents

- [Manifest schema](#manifest-schema)
- [Reference & version constraints](#reference--version-constraints)
- [Box layout](#box-layout)
- [Standalone layouts](#standalone-layouts)
- [Sidecar files](#sidecar-files)
- [Troubleshooting](#troubleshooting)

## Manifest schema

`aipkg.json` fields (from `packages/archive/src/manifest.ts`):

| Field         | Required | Notes                                                                 |
| ------------- | -------- | --------------------------------------------------------------------- |
| `type`        | yes      | One of `cmd`, `skill`, `subagent`, `rule`, `hook`, `box`.             |
| `ref`         | yes      | `<org>/<slug>` or `<org>/<key>/<slug>`. See constraints below.        |
| `version`     | yes      | Semver `x.y.z` (pre-release suffix allowed). `latest` only in deps.   |
| `description` | no\*     | One concise sentence. Always write one — it's the registry blurb.     |
| `homepage`    | no       | Upstream repo URL for imports (or `https://aipkgs.com`).              |
| `repository`  | no       | `{ "type": "git", "url": "<.git url>", "directory"?: "<subdir>" }`.   |
| `issues`      | no       | `{ "url"?: "...", "email"?: "..." }`.                                 |
| `targets`     | no       | Subset of `["claude", "codex"]`.                                      |
| `deps`        | no       | Only meaningful for boxes that reference _separately published_ pkgs. |

`deps` buckets (each maps an alias → an `aipkg://…` ref string):
`cmds`, `skills`, `subagents`, `rules`, `hooks`, `boxes`, plus `mcps`
(alias → `{ "url" }` or `{ "command", "args"?, … }`). For a **vendored box
import you do not populate `deps`** — the asset files ship inside the archive
itself. The already-imported `caveman` and `superpowers` boxes omit `deps`
entirely.

### Minimal box manifest (the common case)

```json
{
  "type": "box",
  "ref": "superpowers/Superpowers",
  "version": "0.1.0",
  "description": "Core skills library — TDD, debugging, code review, plan execution.",
  "homepage": "https://github.com/obra/superpowers",
  "repository": { "type": "git", "url": "https://github.com/obra/superpowers.git" }
}
```

## Reference & version constraints

From `packages/archive/src/ref.ts`:

- Every ref segment (`org`, `key`, `slug`) must match `^[a-z0-9-_]*$`
  (case-insensitive) and be **≤ 30 characters**. Sanitize names accordingly —
  drop spaces/dots/slashes, lowercase the org.
- `org` is lowercase by convention. A box's `slug` is the Capitalized project
  name (`Superpowers`, `Caveman`, `GSD`). Standalone asset slugs are lowercase.
- `version` must be semver `\d+\.\d+\.\d+` (optional `-prerelease`). Fresh
  imports start at `0.1.0` — for both boxes and standalone assets. Use the
  registry version, not the upstream asset's own version (a standalone skill's
  `SKILL.md` may say `version: 2.7.0`; that's the upstream's number, ignore it
  for the `aipkg.json` and start at `0.1.0`).
- A ref may have an optional middle `key` segment (`<org>/<key>/<slug>`); imports
  rarely need it — use the two-segment `<org>/<slug>` form.

## Box layout

One box = one org namespace. The box collector (`collectBoxDirs` in
`packages/cli/src/io/archive.ts`) walks these subdirs:

```
aipkgs/<org>/
├── aipkg.json            # type: box  (required)
├── README.md             # recommended
├── LICENSE.txt           # required for third-party imports
├── HERO_CARD.md          # optional
├── cmds/
│   └── <name>.md         # FLAT files, one per command
├── rules/
│   └── <name>.md         # FLAT files, one per rule
├── subagents/
│   └── <name>.md         # FLAT files, one per subagent
├── skills/
│   └── <slug>/
│       ├── SKILL.md      # required for the skill to be collected
│       ├── README.md     # optional
│       └── assets/ scripts/ references/ …   # copied wholesale
└── hooks/
    ├── hooks.json        # required for hooks to be collected; ONE per box
    └── <script files>    # any scripts the hooks invoke
```

Rules that bite:

- **cmds / rules / subagents are flat `*.md`** directly under their dir. A
  subdir there is ignored by the box collector.
- **skills are subdirs**, each needing its own `SKILL.md`. A skill subdir
  without `SKILL.md` is silently skipped.
- **hooks** are collected from a single `hooks/` dir with one `hooks.json`. If
  upstream has multiple hook configs, merge them into one `hooks.json`.
- Boxes do not nest — there is no `boxes/` subdir inside a box.

## Standalone layouts

Use only when packaging a single asset (the fallback case). Each gets its own
directory with its own `aipkg.json`. This matches `aipkgs/org443/`'s own assets.

Flat assets — **cmd**, **rule**, **subagent** — are strict: the _only_ files
allowed are `aipkg.json`, `<slug>.md`, and the sidecars. Anything else fails
validation (`assertOnlyAllowedFiles`).

```
aipkgs/<org>/cmds/<slug>/
├── aipkg.json            # type: cmd
└── <slug>.md             # filename MUST equal the slug

aipkgs/<org>/rules/<slug>/        # type: rule, <slug>.md
aipkgs/<org>/subagents/<slug>/    # type: subagent, <slug>.md
```

**skill** (flat layout, arbitrary extra files allowed):

```
aipkgs/<org>/skills/<slug>/
├── aipkg.json            # type: skill
├── SKILL.md              # required
└── assets/ scripts/ references/ README.md …   # optional, any depth
```

**hook** (arbitrary files allowed alongside the required `hooks.json`):

```
aipkgs/<org>/hooks/<slug>/
├── aipkg.json            # type: hook
├── hooks.json            # required, must be valid JSON
└── <script files>
```

`hooks.json` shape (from `aipkgs/org443/hooks/status-line/`):

```json
{ "statusLine": { "type": "command", "command": ".claude/hooks/<org>/<script>.sh" } }
```

## Sidecar files

These three may sit at the root of _any_ package (box or standalone) and are
collected automatically (`SIDECAR_FILES`): `README.md`, `HERO_CARD.md`,
`LICENSE.txt`. For third-party imports, `LICENSE.txt` is effectively required —
copy it verbatim from upstream; if the repo has no license, stop and ask.

**Box quirk — per-skill sidecars are dropped.** The skill collector treats a
file literally named `README.md` / `HERO_CARD.md` / `LICENSE.txt` at a skill
subdir's root as a sidecar and skips it (`walk.ts`), so only the **box-root**
sidecars actually ship. A skill's own `README.md` inside a box's
`skills/<slug>/` will *not* be in the archive. Files with any other name (e.g.
`SECURITY.md`, `USAGE.md`) and the `assets/`/`scripts/`/`references/` dirs ship
normally. If a skill's README content must travel, fold it into `SKILL.md` or
rename the file.

This quirk is **box-only**. In a *standalone* skill package the package root
*is* the skill dir, so its `README.md` is the legitimate package-root sidecar
and ships fine — keep it.

## Troubleshooting

`aipkg publish --dry` errors and their usual cause:

- **`archive missing required file: SKILL.md`** — a skill subdir lacks
  `SKILL.md`, or you placed the skill's files flat instead of in `skills/<slug>/`.
- **`archive missing required file: <slug>.md`** — a standalone cmd/rule/subagent
  file isn't named exactly `<slug>.md`.
- **`archive missing required file: hooks.json`** — hooks dir has no `hooks.json`.
- **`archive contains disallowed file: …`** — a strict flat asset (cmd/rule/
  subagent) has an extra file; move it out or repackage as a skill/box.
- **`InvalidManifest` / segment errors** — a ref segment has illegal chars
  (uppercase org, spaces, dots) or is > 30 chars, or `version` isn't semver.
- **`hooks.json is not valid JSON`** — fix the JSON.

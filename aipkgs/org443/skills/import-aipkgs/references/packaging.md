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
| `type`        | yes      | One of `skill`, `subagent`, `rule`, `setup`, `box`.                    |
| `ref`         | yes      | `<org>/<slug>` or `<org>/<key>/<slug>`. See constraints below.        |
| `version`     | yes      | Semver `x.y.z` (pre-release suffix allowed). `latest` only in deps.   |
| `description` | no\*     | One concise sentence. Always write one — it's the registry blurb.     |
| `homepage`    | no       | Upstream repo URL for imports (or `https://aipkgs.com`).              |
| `repository`  | no       | `{ "type": "git", "url": "<.git url>", "directory"?: "<subdir>" }`.   |
| `issues`      | no       | `{ "url"?: "...", "email"?: "..." }`.                                 |
| `targets`     | no       | Subset of `["claude", "codex"]`.                                      |
| `deps`        | no       | Only meaningful for boxes that reference _separately published_ pkgs. |

`deps` buckets (each maps an alias → an `aipkg://…` ref string):
`skills`, `subagents`, `rules`, `setups`, `boxes`. There is no `mcps` bucket —
MCP servers are declared inside a setup package's `setup.json`. In the **preferred
split + box-of-deps shape** the box manifest (under `box/`) populates these
buckets to reference its separately-published assets, e.g.
`"skills": { "vue": "aipkg://skill/<org>/vue@latest" }`; assets can also depend
on each other this way (see [Box layout](#box-layout)). A **legacy bundled box**
omits `deps` and ships the asset files inside its own archive — that's how the
already-imported `caveman` and `superpowers` boxes work.

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

**Preferred (split + box-of-deps):** put the box manifest in `aipkgs/<org>/box/`
so its collector only sees that dir's own sidecars — the assets live as
standalone packages alongside it (`aipkgs/<org>/skills/<slug>/aipkg.json`, etc.)
and the box references them via `deps`. A `--dry` of `box/` should list only
`aipkg.json` + sidecars, never asset files. See `aipkgs/antfu/` and
`aipkgs/gstack/` for the shape.

**Tightly Coupled (bundled):** a box manifest at the org root bundles everything in its
archive. One box = one org namespace; the box collector (`collectBoxDirs` in
`packages/cli/src/io/archive.ts`) walks these subdirs:

```
aipkgs/<org>/
├── aipkg.json            # type: box  (required)
├── README.md             # recommended
├── LICENSE.txt           # required for third-party imports
├── rules/
│   └── <name>.md         # FLAT files, one per rule
├── subagents/
│   └── <name>.md         # FLAT files, one per subagent
├── skills/
│   └── <slug>/
│       ├── SKILL.md      # required for the skill to be collected
│       ├── README.md     # optional
│       └── assets/ scripts/ references/ …   # copied wholesale
├── setup.json           # type: setup config (hooks/statusLine/mcps); optional, ONE per box
└── scripts/             # payload the setup's commands invoke via ${PKG_ROOT}
    └── <script files>
```

Rules that bite:

- **rules / subagents are flat `*.md`** directly under their dir. A
  subdir there is ignored by the box collector.
- **skills are subdirs**, each needing its own `SKILL.md`. A skill subdir
  without `SKILL.md` is silently skipped.
- **setup** is a single root `setup.json` (plus an optional `scripts/` payload).
  If upstream has multiple hook configs, merge them into one `setup.json`.
- Boxes do not nest — there is no `boxes/` subdir inside a box.

## Standalone layouts

Use only when packaging a single asset (the fallback case). Each gets its own
directory with its own `aipkg.json`. This matches `aipkgs/org443/`'s own assets.

Flat assets — **rule**, **subagent** — are strict: the _only_ files allowed are
`aipkg.json`, `<slug>.md`, and the sidecars. Anything else fails validation
(`assertOnlyAllowedFiles`).

```
aipkgs/<org>/rules/<slug>/
├── aipkg.json            # type: rule
└── <slug>.md             # filename MUST equal the slug

aipkgs/<org>/subagents/<slug>/    # type: subagent, <slug>.md
```

**skill** (flat layout, arbitrary extra files allowed):

```
aipkgs/<org>/skills/<slug>/
├── aipkg.json            # type: skill
├── SKILL.md              # required
└── assets/ scripts/ references/ README.md …   # optional, any depth
```

**setup** (arbitrary files allowed alongside the required `setup.json`):

```
aipkgs/<org>/setups/<slug>/
├── aipkg.json            # type: setup
├── setup.json            # required, must be valid JSON
└── scripts/              # scripts the setup's commands invoke (via ${PKG_ROOT})
    └── <script files>
```

`setup.json` carries up to three keys — `hooks`, `statusLine`, `mcps` — any of
which may be absent. Status-line example (from `aipkgs/org443/setups/status-line/`):

```json
{ "statusLine": { "type": "command", "command": "node ${PKG_ROOT}/scripts/status-line.js" } }
```

MCP-server example — an HTTP server uses `url`, a stdio server uses
`command`/`args` (+ optional `env`); on add, entries merge into the user's
`.mcp.json`:

```json
{
  "mcps": {
    "linear": { "url": "https://mcp.linear.app/sse" },
    "local-tools": { "command": "node", "args": ["server.js"] }
  }
}
```

## Sidecar files

These may sit at the root of _any_ package (box or standalone) and are
collected automatically (`SIDECAR_FILES`): `README.md` and `LICENSE.txt`. For
third-party imports, `LICENSE.txt` is effectively required — copy it verbatim
from upstream; if the repo has no license, stop and ask.

**Box quirk — per-skill sidecars are dropped.** The skill collector treats a
file literally named `README.md` / `LICENSE.txt` at a skill
subdir's root as a sidecar and skips it (`walk.ts`), so only the **box-root**
sidecars actually ship. A skill's own `README.md` inside a box's
`skills/<slug>/` will _not_ be in the archive. Files with any other name (e.g.
`SECURITY.md`, `USAGE.md`) and the `assets/`/`scripts/`/`references/` dirs ship
normally. If a skill's README content must travel, fold it into `SKILL.md` or
rename the file.

This quirk is **box-only**. In a _standalone_ skill package the package root
_is_ the skill dir, so its `README.md` is the legitimate package-root sidecar
and ships fine — keep it.

## Troubleshooting

`aipkg publish --dry` errors and their usual cause:

- **`archive missing required file: SKILL.md`** — a skill subdir lacks
  `SKILL.md`, or you placed the skill's files flat instead of in `skills/<slug>/`.
- **`archive missing required file: <slug>.md`** — a standalone rule/subagent
  file isn't named exactly `<slug>.md`.
- **`archive missing required file: setup.json`** — a setup package (or a box
  with a `scripts/` payload) has no root `setup.json`.
- **`archive contains disallowed file: …`** — a strict flat asset (rule/
  subagent) has an extra file; move it out or repackage as a skill/box.
- **`InvalidManifest` / segment errors** — a ref segment has illegal chars
  (uppercase org, spaces, dots) or is > 30 chars, or `version` isn't semver.
- **`setup.json is not valid JSON`** — fix the JSON.

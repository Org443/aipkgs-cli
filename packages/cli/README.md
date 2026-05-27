# @aipkgs/cli

CLI for [AIpkg](https://app.aipkgs.com) — a registry for AI commands, skills, prompts, sub-agents, rules, and boxes.

## Docs

- Website: https://app.aipkgs.com
- CLI docs: https://app.aipkgs.com/docs/cli
- Browse packages: https://app.aipkgs.com/packages

## Install

```bash
npm install -g @aipkgs/cli
```

## Quick start

```bash
aipkg init
aipkg cmd org443/search-aipkgs
aipkg mcp add linear --url https://mcp.linear.app/mcp
```


## Layout

```
.
├── aipkg.json         — project manifest + declared deps
├── aipkg.lock         — pinned versions and sha256 for each dep
├── aipkgs/            — source of published AIpkgs
│   ├── cmds/
│   ├── skills/
│   ├── rules/
│   └── subagents/
└── packages/
    ├── archive/       — tarball + manifest format for the registry
    ├── cli/           — the `aipkg` CLI (@aipkgs/cli)
    └── placement/     — writes installed assets into tool-specific dirs
```

## Packages

### `archive`

Defines the archive format (`aipkg.json` manifest + assets) that is packed into a tarball and uploaded to the AIpkg registry. Handles manifest parsing/validation, ref resolution, and tarball read/write for the supported archive types (`box`, `cmd`, `skill`, `rule`, `subagent`).

### `cli`

The user-facing `aipkg` command, published to npm as `@aipkgs/cli`. Implements commands like `init`, `cmd`, and `mcp`, and orchestrates fetching archives from the registry API and installing them locally via `placement`.

### `placement`

Takes a resolved archive and writes its assets into the right place on disk for each supported AI tool. Targets currently include `claude` and `codex` (coming soon), isolating tool-specific filesystem layout from the rest of the CLI.

## Registry usage

This repo itself uses the AIpkg registry — `aipkg.json`, `aipkg.lock`, and `aipkgs/` here serve as a working example of the deps system.

### `aipkg.json`

The project manifest. Declares the project's `ref`/`type`/`version` and lists registry dependencies under `deps` (by kind: `cmds`, `skills`, `rules`, `subagents`), each pinned to a registry ref like `aipkg://cmd/org443/search-aipkgs@latest`.

### `aipkg.lock`

Lockfile generated from `aipkg.json`. Records the exact resolved `version` and `sha256` for every dep (and any transitive `parent`), so installs are reproducible.

### `aipkgs/`

Examples of assets published to the registry, organized by kind (`cmds/`, `skills/`, `rules/`, `subagents/`). Each entry is a full archive we publish (its `aipkg.json` plus assets).

## Publishing

Publish a single package by running `aipkg publish` from the directory containing its `aipkg.json`:

```bash
cd aipkgs/cmds/org443/search-aipkgs
aipkg publish
```

The CLI packs the manifest plus its assets into a tarball and uploads it to the AIpkg registry. The package's `ref`/`type`/`version` come from `aipkg.json` — bump the `version` field before republishing.

To publish every package under `aipkgs/` in this repo, use the helper script:

```bash
scripts/publish-all.sh                  # publish everything under aipkgs/
scripts/publish-all.sh --dry-run        # show what would be published
scripts/publish-all.sh aipkgs/caveman   # restrict to one or more roots
```

The script recurses for every `aipkg.json` it finds, runs `aipkg publish` in each directory, continues on failure, and prints a success/failure summary at the end.

## License

See [LICENSE.txt](./LICENSE.txt).

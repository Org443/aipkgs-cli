# @aipkgs/cli

CLI for [AIpkg](https://aipkgs.com) — a registry for AI commands, skills, prompts, sub-agents, rules, and boxes. Install packages from the registry into your project and have them written into the right place for whichever AI tool you use.

## Docs

- Website: https://aipkgs.com
- CLI docs: https://aipkgs.com/docs/cli
- Browse packages: https://aipkgs.com/packages

## Install

```bash
npm install -g @aipkgs/cli
```

Or run it on demand without installing:

```bash
npx @aipkgs/cli <command>
```

## Quick start

```bash
npx @aipkgs/cli init                                            # create aipkg.json in the current project
npx @aipkgs/cli skill org443/search-aipkgs                      # install a skill from the registry
```

## How it works

The CLI manages AI assets — commands, skills, prompts, sub-agents, rules, and boxes — as versioned dependencies of your project, much like a package manager for code.

When you install a package, the CLI fetches its archive from the AIpkg registry, verifies it, records it in your manifest and lockfile, and writes the assets into the tool-specific location on disk (for example, Claude's config directories). You declare what you want; the CLI keeps your project in sync.

### `aipkg.json` — the manifest

The project manifest. It declares your project and lists the registry packages you depend on, grouped by kind (`skills`, `rules`, `subagents`, …). Each dependency is pinned to a registry ref such as `aipkg://cmd/org443/search-aipkgs@latest`. This file is yours to edit and commit — it's the source of truth for what your project pulls from the registry.

### `aipkg.lock` — the lockfile

Generated from `aipkg.json`. It records the exact resolved `version` and `sha256` for every dependency (and any transitive parents), so installs are reproducible across machines and over time. Commit it alongside the manifest; let the CLI regenerate it rather than editing it by hand.

### What it targets

Installed assets are placed into tool-specific directories so the AI tool picks them up automatically. Targets currently include `claude`, with `codex` coming soon. The same registry package can be placed for whichever supported tool you're using.

## Publishing

You can publish your own packages to the registry. Run `publish` from the directory containing the package's `aipkg.json`:

```bash
cd path/to/your-package      # the dir with aipkg.json
npx @aipkgs/cli publish
```

The CLI packs the manifest plus its assets into a tarball and uploads it to the AIpkg registry. The package's `ref`/`type`/`version` come from `aipkg.json` — bump the `version` field before republishing.

## License

See [LICENSE.txt](./LICENSE.txt).

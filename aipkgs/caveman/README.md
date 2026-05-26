# aipkgs-caveman

Re-packaging of [JuliusBrussee/caveman](https://github.com/JuliusBrussee/caveman) — ultra-compressed (caveman-style) communication mode for AI coding agents — as AIpkgs packages under the `caveman/` org namespace.

The upstream repo targets multiple agents: its `commands/` directory is in Codex `.toml` format, and its `skills/` directory contains Claude-shaped `SKILL.md` files. This namespace bundles both into the AIpkgs registry format so they install via `aipkg`.

## Provenance

Upstream source-of-truth: <https://github.com/JuliusBrussee/caveman>

Licensed under **MIT** — see [LICENSE.txt](LICENSE.txt). Copyright (c) 2026 Julius Brussee.

Skill bodies (`SKILL.md`) are copied verbatim from upstream. Commands were converted from the upstream `.toml` (Codex) shape to the AIpkgs `.md` shape with frontmatter; the `prompt` / `description` content is unchanged.

## Skills

| Slug | Ref |
|------|-----|
| caveman | `caveman/caveman` |
| cavecrew | `caveman/cavecrew` |
| caveman-commit | `caveman/caveman-commit` |
| caveman-compress | `caveman/caveman-compress` |
| caveman-help | `caveman/caveman-help` |
| caveman-review | `caveman/caveman-review` |
| caveman-stats | `caveman/caveman-stats` |

## Commands

| Slug | Ref |
|------|-----|
| caveman | `caveman/caveman` |
| caveman-commit | `caveman/caveman-commit` |
| caveman-review | `caveman/caveman-review` |
| caveman-init | `caveman/caveman-init` |

> Note: `caveman-stats` upstream is delivered by a Claude Code hook (`hooks/caveman-stats.js`) that emits a `decision: "block"` reason. The skill is included for documentation, but stat numbers come from the hook — install that separately from upstream if you want live output.

# node-suite

Org443's full Node/TypeScript Claude Code setup as a single installable box. Bundles the rules, skills, and setups used across Org443's Node projects — install the box and everything lands at once.

## What's included

### Rules

| Package | What it enforces |
| --- | --- |
| `org443/node-general` | General Node + TypeScript conventions: function signatures, context threading, call style, concurrency, file layout, and date handling |
| `org443/node-workspaces` | npm-workspaces monorepo structure: workspace scopes (`@service/*` vs `@local/*`), build contracts, and where to declare dependencies (workspace vs root) |
| `org443/short-comments` | Comments earn their line — keep the *why*, strip the paraphrase |

### Skills

| Package | What it does |
| --- | --- |
| `os/frontend-design` | Generates distinctive, production-grade frontend UI — React components, landing pages, dashboards — avoiding generic AI aesthetics |
| `os/skill-creator` | Create, edit, and benchmark Claude Code skills; run evals and optimize trigger descriptions |
| `org443/import-aipkgs` | Vendor a GitHub repo's Claude Code plugins into `aipkgs/` as a publishable box with the correct manifest, LICENSE, and README |
| `org443/search-aipkgs` | Search and discover packages in the AIpkgs registry |

### Setups

| Package | What it configures |
| --- | --- |
| `org443/workflow-mcps` | Registers Org443's workflow MCP servers (Linear, Slack) for project management and collaboration |
| `org443/status-line` | Terminal status line that displays model name, workspace path, context window usage, session cost, and API URL after each Claude Code turn |

## Install

```sh
npx @aipkgs/cli box org443/node-suite
```

## Source

All packages in this box are published from [Org443/aipkgs-cli](https://github.com/Org443/aipkgs-cli). Install individual packages if you only need a subset.

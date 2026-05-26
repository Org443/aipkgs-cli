---
description: Node + TypeScript rules for an npm-workspaces monorepo (workspace scopes, build contracts, dependency placement).
---

# Node Workspaces Rules

Apply these rules when working in an npm-workspaces monorepo composed of deployable services and internal libraries.

## Workspace organization

Workspace scopes; each has a different build contract — don't mix them.

- **`@service/*`** — deployable services. Bundled with esbuild to `dist/index.js`, packaged as a Docker image. Has `build`, `start`, `dev` scripts and a `Dockerfile`.
- **`@local/*`** — internal libraries. **No build step.** Ships raw TS via `"exports": { ".": "./src/index.ts" }`. Consumed directly by services and by vitest.
- **devDependencies** - all references to the workspace imports should go in the `devDependencies` not the `dependencies`

When adding a workspace, follow the matching template above. Don't add a build to `@local/*`. Avoid cross-import between services — share via an internal library.

## Dependencies

- Cross-cutting deps used by 2+ workspaces → root `package.json` (hoisted).
- Workspace-specific deps (e.g. a web framework only the frontend uses) → that workspace's `package.json`.
- Internal workspace deps use wildcard version (`"*"`) and added to the `devDependencies`.
- Quick rule of thumb: if more than one workspace would import it, put it at the root. If only one would, put it in that workspace.

## Don'ts (quick reference)

- Don't add a build step to internal `@local/*` packages.
- Don't cross-import between services — go through an internal library.
- Don't declare the same shared dep in multiple workspaces — hoist it to the root to avoid version drift and multiple installed copies.

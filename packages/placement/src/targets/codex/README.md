# Codex placement target

Places aipkg assets onto the [OpenAI Codex CLI](https://github.com/openai/codex)'s
filesystem conventions. Like the Claude target, **all placement is project-local**
(relative to `process.cwd()`) — nothing is written to `~/.codex` or `~/.agents`.

Codex's surfaces don't line up one-to-one with Claude Code's, so this target is
deliberately partial: skills, subagents, rules, hooks, and MCP servers are placed
natively; the status line has no Codex equivalent and is logged, then skipped. The
notes below capture every meaningful difference and caveat.

> Codex is moving fast; this reflects behavior verified around **June 2026**
> (Codex CLI ~0.137). Treat the file locations as the stable contract and the
> "manual steps" as things to re-check against the current Codex docs.

## At a glance

| Asset           | Destination                          | Format                         | Status |
| --------------- | ------------------------------------ | ------------------------------ | ------ |
| Skill           | `.agents/skills/<slug>/`             | `SKILL.md` tree (verbatim)     | ✅ native |
| Subagent        | `.codex/agents/<slug>.toml`          | TOML (`developer_instructions`)| ✅ converted |
| Hook            | `.codex/hooks.json` + `.codex/scripts/<slug>/` | JSON event map          | ✅ native (needs enabling — see below) |
| Markdown rule   | `./AGENTS.md`                        | aipkg-owned comment block      | ✅ merged |
| MCP server      | `.codex/config.toml` (`[mcp_servers.<name>]`) | TOML + sidecar ledger | ✅ native |
| Status line     | —                                    | —                              | ⚠️ logged + skipped |

## Supported

### Skills → `.agents/skills/<slug>/`

Codex adopted the open agent-skills standard. Skills are discovered under
**`.agents/skills/`** — **not** `.codex/skills/` (the original experimental path)
and not Claude's `.claude/skills/`. The `SKILL.md` format (`name` / `description`
front-matter + body) is identical to Claude's, so the whole archive tree is placed
verbatim.

- Caveat: `.agents/skills/` is a shared, cross-tool location, so a placed skill may
  be visible to other agents that read it — it isn't a Codex-private namespace.
- Caveat: Codex discovers skills at startup; a new skill may require restarting the
  session to appear.

### Subagents → `.codex/agents/<slug>.toml`

Codex subagents are **TOML**, not Markdown-with-front-matter. The source Markdown is
converted (see `subagent.ts`):

- `name` = the install slug (Codex treats `name` as the authoritative identifier and
  expects it to match the filename).
- `description` = the source front-matter `description` (falls back to the slug).
- `developer_instructions` = the Markdown body.
- **`tools` and `model` are intentionally dropped.** Codex has no per-agent `tools`
  allowlist (restrict via `sandbox_mode` / `mcp_servers` instead), and Claude model
  names (e.g. `sonnet`) are not valid Codex models. Omitting `model` inherits the
  parent session's model.

Behavioral caveat: unlike Claude, Codex does **not** auto-delegate based on a
subagent's `description` — it only spawns a subagent when explicitly asked.

### Hooks → `.codex/hooks.json` (+ script payload under `.codex/scripts/<ref>/`)

Codex's hooks system is deliberately Claude-shaped (event → matcher → command), so
a setup bundle's event map is merged into **`.codex/hooks.json`** under a top-level
`hooks` key, with the same `__aipkg` ownership tags and `${PKG_ROOT}` rewriting the
Claude target uses (`${PKG_ROOT}` → `.codex/scripts/<ref>`, where the bundle's own
script payload is placed, namespaced by the package ref). The shared parsing lives
in [`../hooks-format.ts`](../hooks-format.ts).

⚠️ **Two manual steps are required for placed hooks to actually run** — aipkg does
neither, by design:

1. **Enable the feature.** Hooks only fire when `[features] hooks = true` in
   `config.toml`. (aipkg does not edit the user's primary config.)
2. **Trust the hook.** Codex content-hashes hooks and skips untrusted ones until you
   approve them via the `/hooks` TUI command. Rewriting the file re-triggers the
   trust prompt.

Coverage caveat: in some Codex builds `PreToolUse` / `PostToolUse` fire reliably only
for `Bash`. A bundled `statusLine` is surfaced from the install (with `${PKG_ROOT}`
resolved) but ultimately skipped — see Status line below.

### MCP servers → `.codex/config.toml`

Codex reads MCP servers from `[mcp_servers.<name>]` tables in `config.toml`. aipkg
writes a **project-level `.codex/config.toml`** (never the user's primary
`~/.codex/config.toml`), so a setup bundle's `mcps` become `[mcp_servers.<name>]`
tables there. An aipkg entry maps to Codex's shape via `toCodexServer`: a `url` is an
HTTP server (its `headers` → `http_headers`); a `command` is a stdio server
(`command` / `args` / `env`). The aipkg `type` and `oauth` fields have no
`[mcp_servers.*]` equivalent and are dropped.

Ownership is tracked differently from Claude. Codex parses `config.toml` with strict
serde (`deny_unknown_fields`), so we **cannot** embed an `__aipkg` owner tag inside a
server table the way the Claude target does in `.mcp.json` — Codex would reject the
file. Instead, each `[mcp_servers.*]` table stays schema-clean and ownership lives in
an aipkg-owned sidecar ledger, **`.codex/aipkg-mcp.json`** (`{ "<server>": "<ref>" }`),
that Codex never reads. Remove walks the ledger to strip exactly the servers a given
bundle placed, then deletes the empty `mcp_servers` table and the ledger when nothing
aipkg-owned remains.

- Caveat: `smol-toml` does not preserve comments or original formatting when it
  rewrites `config.toml`. A user's hand-written keys and values are preserved, but the
  file is reformatted. aipkg only ever manages the `mcp_servers` table.
- Caveat: server names are the author's chosen names, un-namespaced. Two bundles that
  each ship a server with the same name collide (last write wins); the Claude target
  avoids this by namespacing the key, but Codex tool names should stay clean.

### Markdown rules → `./AGENTS.md`

Codex reads a single concatenated **`AGENTS.md`** per directory (root → cwd, closest
wins). There is no `rules/` directory and **no `@import` syntax** like Claude's
`CLAUDE.md`. So each rule is written as an aipkg-owned, comment-delimited block in the
project-root `AGENTS.md`:

```md
<!-- aipkg:rule:<slug> start -->
…rule body…
<!-- aipkg:rule:<slug> end -->
```

The user's own prose and other rules' blocks are preserved; reinstall replaces the
block in place; removal strips just that block (and deletes `AGENTS.md` if it becomes
empty). Keep rules concise — Codex caps the per-file size via `project_doc_max_bytes`.

## Not supported

This surface has no faithful Codex equivalent. Rather than throw (which would abort an
otherwise-fine multi-target install), it **no-ops and logs a `codex: …` notice**.

### Status line — logged, then skipped

Codex's status line is a fixed set of built-in items configured under `[tui]` in
`config.toml`; there is no custom-command status line like Claude's `statusLine`. When
a setup bundle ships a `statusLine`, the install resolves its `${PKG_ROOT}` command,
logs a `codex: status line not supported` notice (see `notice.ts`), and writes
nothing.

## Differences vs. the Claude target

| Aspect            | Claude                                   | Codex                                            |
| ----------------- | ---------------------------------------- | ------------------------------------------------ |
| Skills dir        | `.claude/skills/<slug>/`                 | `.agents/skills/<slug>/`                          |
| Subagents         | `.claude/agents/<slug>.md` (MD + YAML)   | `.codex/agents/<slug>.toml` (TOML)               |
| Subagent tools/model | `tools` / `model` honored             | dropped (no `tools`; Claude model names invalid) |
| Hooks file        | `.claude/settings.local.json` (`hooks`)  | `.codex/hooks.json` (`{ hooks: … }`)             |
| Hooks enablement  | on by default                            | needs `[features] hooks = true` + `/hooks` trust |
| Rules             | `.claude/rules/<slug>.md` (one file)     | block inside `./AGENTS.md`                        |
| MCP               | `.mcp.json` (`__aipkg` tag in object)    | `.codex/config.toml` + `.codex/aipkg-mcp.json` ledger |
| Status line       | `statusLine` in settings (script)        | unsupported (logged, skipped)                    |

## Implementation map

- `codex.agent.ts` — `CodexAgent extends Agent`; routes `install` / `remove` by manifest type.
- `types/skill.ts` — places the `SKILL.md` tree under `.agents/skills/<slug>/`.
- `types/subagent.ts` — Markdown → Codex TOML agent conversion.
- `types/rule.ts` — delegates to `agents-config.ts`.
- `types/setup.ts` — scripts + hooks + MCP + status-line notice; `removeSetup` reverses them.
- `types/box.ts` — fans a box's children + setup out to the per-type installers.
- `hooks-config.ts` — read/merge/remove for `.codex/hooks.json`.
- `mcp-config.ts` — `[mcp_servers.*]` tables in `.codex/config.toml` + the sidecar ownership ledger.
- `agents-config.ts` — aipkg-owned rule blocks in `AGENTS.md`.
- `notice.ts` — the `codex:` notice helper for logged/skipped surfaces.
- `../hooks-format.ts` — hook parsing / `${PKG_ROOT}` / `__aipkg` ownership shared with the Claude target.

# Codex placement target

Places aipkg assets onto the [OpenAI Codex CLI](https://github.com/openai/codex)'s
filesystem conventions. Like the Claude target, **all placement is project-local**
(relative to `process.cwd()`) — nothing is written to `~/.codex` or `~/.agents`.

Codex's surfaces don't line up one-to-one with Claude Code's, so this target is
deliberately partial: three asset surfaces are placed natively, two have no Codex
equivalent and are skipped with a warning, and MCP config is deferred. The notes
below capture every meaningful difference and caveat.

> Codex is moving fast; this reflects behavior verified around **June 2026**
> (Codex CLI ~0.137). Treat the file locations as the stable contract and the
> "manual steps" as things to re-check against the current Codex docs.

## At a glance

| Asset           | Destination                          | Format                         | Status |
| --------------- | ------------------------------------ | ------------------------------ | ------ |
| Skill           | `.agents/skills/<slug>/`             | `SKILL.md` tree (verbatim)     | ✅ native |
| Subagent        | `.codex/agents/<slug>.toml`          | TOML (`developer_instructions`)| ✅ converted |
| Hook            | `.codex/hooks.json` + `.codex/hooks/<slug>/` | JSON event map          | ✅ native (needs enabling — see below) |
| Markdown rule   | `./AGENTS.md`                        | aipkg-owned comment block      | ✅ merged |
| Slash command   | —                                    | —                              | ⚠️ skipped + warn |
| Status line     | —                                    | —                              | ⚠️ skipped + warn |
| MCP server      | —                                    | —                              | ⚠️ skipped + warn (deferred) |

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

### Hooks → `.codex/hooks.json` (+ files under `.codex/hooks/<slug>/`)

Codex's hooks system is deliberately Claude-shaped (event → matcher → command), so
the package's `settings.json` is merged into **`.codex/hooks.json`** under a top-level
`hooks` key, with the same `__aipkg` ownership tags and `${PKG_ROOT}` rewriting the
Claude target uses (`${PKG_ROOT}` → `.codex/hooks/<slug>`). The shared parsing lives
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

These surfaces have no faithful Codex equivalent. Rather than throw (which would abort
an otherwise-fine multi-target install), they **no-op and emit a `codex: …` warning**.


### Status line — skipped

Codex's status line is a fixed set of built-in items configured under `[tui]` in
`config.toml`; there is no custom-command status line like Claude's `statusLine`.
`setStatusLine` warns and writes nothing; `clearStatusLine` is a no-op. A `statusLine`
bundled inside a hook is reported once, centrally, at the `setStatusLine` step.

### MCP servers — skipped (deferred)

Codex MCP servers are `[mcp_servers.<name>]` tables in `config.toml`. aipkg doesn't
manage these yet: safely editing a user's primary TOML config (preserving comments and
formatting) is non-trivial, and MCP wasn't in this target's initial scope. `installMcp`
warns and writes nothing so an install that merely *includes* an MCP dependency still
succeeds when Codex is among the targets. (Future work: write `[mcp_servers]` into a
project-level `.codex/config.toml`.)

## Differences vs. the Claude target

| Aspect            | Claude                                   | Codex                                            |
| ----------------- | ---------------------------------------- | ------------------------------------------------ |
| Skills dir        | `.claude/skills/<slug>/`                 | `.agents/skills/<slug>/`                          |
| Subagents         | `.claude/agents/<slug>.md` (MD + YAML)   | `.codex/agents/<slug>.toml` (TOML)               |
| Subagent tools/model | `tools` / `model` honored             | dropped (no `tools`; Claude model names invalid) |
| Hooks file        | `.claude/settings.local.json` (`hooks`)  | `.codex/hooks.json` (`{ hooks: … }`)             |
| Hooks enablement  | on by default                            | needs `[features] hooks = true` + `/hooks` trust |
| Rules             | `.claude/rules/<slug>.md` (one file)     | block inside `./AGENTS.md`                        |
| Slash commands    | `.claude/commands/<slug>.md`             | unsupported (skipped)                             |
| Status line       | `statusLine` in settings (script)        | unsupported (skipped)                             |
| MCP               | `.mcp.json`                              | unsupported (deferred)                            |

## Implementation map

- `index.ts` — assembles the `Target` from the modules below.
- `install.ts` — `install` / `installFiles` / `remove`, routing by asset type.
- `subagent.ts` — Markdown → Codex TOML agent conversion.
- `hooks-config.ts` — read/merge/remove for `.codex/hooks.json`.
- `agents-config.ts` — aipkg-owned rule blocks in `AGENTS.md`.
- `status-line.ts`, `mcp.ts`, `unsupported.ts` — the skipped surfaces + the shared warning helper.
- `../hooks-format.ts` — hook parsing / `${PKG_ROOT}` / `__aipkg` ownership shared with the Claude target.

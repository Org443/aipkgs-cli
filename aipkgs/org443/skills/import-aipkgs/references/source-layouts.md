# Source layout discovery

External repos hold Claude Code assets in many shapes. This is how to find each
asset type and map it into the aipkgs box layout. Always inventory the repo
top-level first — a repo's structure usually reveals its convention immediately.

## Where to look

Check both the repo root and a `.claude/` (or `.claude-plugin/`) dir; plugin
repos often nest everything under `.claude/`.

**Watch for duplicate asset trees.** A repo may expose the same assets in more
than one place — e.g. a complete top-level `skills/` *and* a partial copy under
`plugins/<name>/skills/`, or both `commands/` and `.claude/commands/`. Don't
double-count. Pick one canonical source: if a `plugin.json` / `.claude-plugin/`
manifest declares a root, trust it; otherwise prefer the most complete tree.
Dedupe by slug and tell the user which copy you used.

| Asset      | Common upstream locations                                              | Identify by                           |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------- |
| Skill      | `skills/<name>/`, `.claude/skills/<name>/`, a bare top-level skill     | a `SKILL.md` file                     |
| Command    | `commands/`, `.claude/commands/`, `cmds/`                              | `*.md` with command frontmatter       |
| Subagent   | `agents/`, `.claude/agents/`, `subagents/`                             | `*.md` with agent frontmatter         |
| Rule       | `rules/`, instruction `*.md`, sections of `CLAUDE.md`/`AGENTS.md`      | persistent-instruction markdown       |
| Hook       | `hooks/`, `.claude/hooks/`, `hooks` in `settings.json`/`plugin.json`   | a `hooks.json` + scripts              |
| MCP server | repo _is_ an MCP server (has a server entry point, `mcp` in name/docs) | exposes an MCP `url` or stdio command |

## Plugin manifests

Claude Code plugin repos may carry a `.claude-plugin/plugin.json` or a
`plugin.json` listing the assets. Read it if present — it's the authoritative
inventory. But still verify each referenced file exists before packaging.

## Mapping notes per type

**Skills.** Copy the whole skill directory into `skills/<slug>/`, keeping
`SKILL.md` at its root and all `assets/`/`scripts/`/`references/` intact. Don't
flatten nested resources. If a repo is a _single_ top-level skill (root
`SKILL.md`), that's the standalone-skill fallback case.

**Commands.** Each command becomes a flat `cmds/<slug>.md` in the box (slug =
the command's filename, sanitized). As a standalone `cmd` package it's a
`<slug>.md` at the package root next to `aipkg.json`. Keep the frontmatter —
that's what the agent reads.

Commands ship in two upstream formats; both must be packaged, never dropped:

- **Markdown** (`commands/*.md`): copy as-is.
- **TOML** (`commands/*.toml`, Claude Code's newer format with `description` and
  `prompt` keys): **convert** to `<slug>.md`. Put `description` into YAML
  frontmatter and the `prompt` value as the markdown body:

  ```md
  ---
  description: <the toml description value>
  ---

  <the toml prompt value, verbatim>
  ```

The earlier "strip non-markdown" instinct is wrong for commands — TOML commands
are real assets. Only drop files that genuinely aren't assets (license headers,
test fixtures, etc.).

**Subagents.** Same as commands but under `subagents/`. Agent `*.md` files have
`name`/`description` frontmatter; preserve it.

**Rules.** Rules are persistent instruction docs. If upstream ships discrete
rule files, copy each to `rules/<slug>.md`. If the "rules" only exist as
sections inside a big `CLAUDE.md`, ask the user whether to split them out — don't
silently fragment someone's instruction file.

**Hooks.** Consolidate to one `hooks/hooks.json` for the box plus the scripts it
calls. Upstream hook configs often live in `settings.json` or a plugin manifest
(`plugin.json`) rather than a standalone `hooks.json` — translate whatever you
find into the `hooks.json` shape. Hooks come in two shapes:

- **Single command** (e.g. `statusLine`): see [packaging.md](packaging.md#sidecar-files).
- **Event arrays** (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, …): each
  event maps to an array of matcher/hook groups, e.g.:

  ```json
  {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node \".claude/hooks/<org>/session-start.js\"" }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node \".claude/hooks/<org>/prompt.js\"" }] }
    ]
  }
  ```

Copy the referenced scripts into `hooks/` and **rewrite their paths** to where
they'll live once installed: `.claude/hooks/<org>/<script>`. Upstream paths like
`${CLAUDE_PLUGIN_ROOT}/src/hooks/x.js` won't resolve after install, so replace
them. The archive validator only checks that `hooks.json` is valid JSON — it does
**not** verify command paths — so a wrong path fails silently at install time.
Double-check every command string by hand.

**MCP servers.** Don't package files. Determine the connection: an HTTP server
exposes a `url`; a stdio server is launched by a `command` + `args` (often shown
in the repo's README install section). Hand the user the matching
`aipkg mcp add` command — see SKILL.md step 8.

## Sanity checks before packaging

- Does each discovered skill dir actually contain `SKILL.md`? (Else the box
  collector skips it.)
- Did you convert any `.toml` commands to `<slug>.md` rather than dropping them?
- Did you dedupe assets that appear in more than one tree?
- Any slug clashes after sanitizing names to `^[a-z0-9-_]+$`? Rename to
  disambiguate and tell the user.
- Is there a top-level `LICENSE`? If not, flag it before going further.

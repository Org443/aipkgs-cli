# Archive

An archive is the tarball file that is uploaded to the `AIpkg` registry.

## Archive Components

An archive must contain an `aipkg.json` file at the root.
The other file entries that an archive has is dependent upon the `type` of archive.
The `type` of the archive is set in the `aipkg.json` manifest type field.

### Manifest `aipkg.json`

```ts
type Manifest = {
    ref: string,
    type: "box" | "skill" | "rule" | "subagent" | "setup",
    version: string,
    tags?: string[], // up to 5 user-authored discovery tags
    deps?: {
        skills?: Record<string, string>,
        subagents?: Record<string, string>,
        rules?: Record<string, string>,
        setups?: Record<string, string>,
        boxes?: Record<string, string>,
    }
}
```

For `setup` archives, `archiveService.parse` augments `tags` with auto-detected
capability tags (`hooks` / `mcp` / `statusline`) derived from `setup.json`, so
the parsed manifest advertises both the author's tags and what the setup
configures. Authors don't write the capability tags themselves.

### Setup Archive

A setup bundle configures the agent rather than adding a prompt asset. Its
`setup.json` carries hooks (an event map), an optional `statusLine`, and any
`mcps` (MCP server definitions); an optional `scripts/` payload holds the files
those hooks invoke (referenced via `${PKG_ROOT}`). On install, the scripts land
under `.claude/hooks/<org>/<key?>/<slug>/`, hooks and the status line merge into
`.claude/settings.local.json`, and MCP servers merge into `.mcp.json`.

- `aipkg.json`
- `setup.json`
- `scripts/**` (optional)
- `README.md` (optional)
- `LICENSE.txt` (optional)

### Rule Archive

- `aipkg.json`
- `<rule-name>.md`
- `LICENSE.txt` (optional)


### Subagent Archive

- `aipkg.json`
- `<subagent-name>.md`
- `LICENSE.txt` (optional)


### Skill Archive

The skill archive uses a flat layout — `SKILL.md` lives at the root, and any
other files the skill needs (docs, assets, scripts, references, etc.) sit
alongside it at any depth.

- `aipkg.json`
- `SKILL.md`
- `README.md` (optional)
- `LICENSE.txt` (optional)
- `assets/`, `scripts/`, `references/`, … (optional, arbitrary)



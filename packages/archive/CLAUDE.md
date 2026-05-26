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
    type: "box" | "cmd" | "skill" | "rule" | "subagent",
    version: 1,
    cmds?: Record<string, AssetEntry>,
    skills?: Record<string, AssetEntry>,
    rules?: Record<string, AssetEntry>,
    subagent?: Record<string, AssetEntry>
    mcps?: Record<string, McpEntry>
}
```

### Cmd Archive

- `aipkg.json`
- `<cmd-name>.md`
- `HERO_CARD.md` (optional)
- `LICENSE.txt` (optional)

### Rule Archive

- `aipkg.json`
- `<rule-name>.md`
- `HERO_CARD.md` (optional)
- `LICENSE.txt` (optional)


### Subagent Archive

- `aipkg.json`
- `<subagent-name>.md`
- `HERO_CARD.md` (optional)
- `LICENSE.txt` (optional)


### Skill Archive

The skill archive uses a flat layout — `SKILL.md` lives at the root, and any
other files the skill needs (docs, assets, scripts, references, etc.) sit
alongside it at any depth.

- `aipkg.json`
- `SKILL.md`
- `README.md` (optional)
- `HERO_CARD.md` (optional)
- `LICENSE.txt` (optional)
- `assets/`, `scripts/`, `references/`, … (optional, arbitrary)



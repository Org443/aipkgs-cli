---
description: Explores the AIpkgs registry to help the user find the right package
allowed-tools: Bash
allowed-commands:
  - curl *
---

# Context

[AIpkgs](https://aipkgs.com) is an AI skills, commands, rules, subagents and MCP registry — like NPM but for AI agent building blocks.

**Package types:**

- `cmd` — slash commands Claude runs (e.g. `/pr-create`)
- `skill` — reusable prompt libraries Claude loads as context
- `rule` — always-on behavior rules injected into Claude's context
- `subagent` — specialist agents Claude can delegate tasks to
- `agent` — full agents

**Package ref format:** `<type>/<org>/<slug>` or `<type>/<org>/<key>/<slug>`  
**Install example:** `aipkg cmd <org>/<slug>`

## API

Base URL: `https://api.aipkgs.com`

### List / search packages

```
GET /v1/packages?search=<query>&type=<type>&limit=<n>&cursor=<cursor>
```

Query params (all optional):

- `search` — free-text filter on slug, key, description, and tags (ILIKE)
- `type` — filter by type: `cmd`, `skill`, `rule`, `subagent`, `agent`
- `limit` — page size, default 25, max 100
- `cursor` — opaque cursor string for next page

Response shape:

```json
{
  "packages": [
    {
      "package": {
        "id": "...",
        "org_namespace": "acme",
        "slug": "pr-create",
        "key": null,
        "type": "cmd",
        "tags": ["github", "pull-request"],
        "supports": ["claude"],
        "latest_version": "1.2.0",
        "total_downloads": 482,
        "total_likes": 17,
        "created_at": 1700000000000,
        "updated_at": 1700000000000
      },
      "app_url": "https://aipkgs.com/packages/commands/acme/pr-create"
    }
  ],
  "next_cursor": "<opaque string, omitted on last page>"
}
```

Note: descriptions are **not** in the list response. To get a package's description, fetch its manifest:

```
GET /v1/packages/<type>/<org>/<slug>/latest/aipkg.json
GET /v1/packages/<type>/<org>/<key>/<slug>/latest/aipkg.json
```

## Your Task

The user's goal: **$ARGUMENTS**

Help them discover and evaluate the right package(s) for their needs. Follow these steps:

### Step 1 — Understand intent

Parse the user's goal from `$ARGUMENTS`. If it's empty, ask: "What are you trying to do? Describe the task and I'll search the registry for the best match."

Identify:

- The **task** they want to automate
- Any **type preference** (`cmd` / `skill` / `rule` / `subagent`), if stated
- **Keywords** to search with

### Step 2 — Search the registry

Call the list endpoint with a relevant search term. URL-encode the value:

```bash
curl -s "https://api.aipkgs.com/v1/packages?search=<encoded-term>"
```

If the user mentioned a specific type, add `&type=<type>`:

```bash
curl -s "https://api.aipkgs.com/v1/packages?search=<encoded-term>&type=<type>"
```

If results are sparse (fewer than 3), try a second call with a broader or synonymous term. If the registry has many results, you can paginate using `next_cursor`:

```bash
curl -s "https://api.aipkgs.com/v1/packages?search=<term>&cursor=<next_cursor>"
```

### Step 3 — Fetch descriptions for top results

The list response does not include descriptions. For each promising package, fetch its manifest:

```bash
# No key:
curl -s "https://api.aipkgs.com/v1/packages/<type>/<org_namespace>/<slug>/latest/aipkg.json"

# With key:
curl -s "https://api.aipkgs.com/v1/packages/<type>/<org_namespace>/<key>/<slug>/latest/aipkg.json"
```

### Step 4 — Present recommendations

Show the top 3–5 matches in this format:

```
## <slug> · <type>
<org_namespace>/<slug>  @<latest_version>  ↓<total_downloads>  ♥<total_likes>
Tags: <tags>

<description from manifest>

Install : aipkg <type> <org_namespace>/<slug>
Browse  : <app_url>
```

Lead with the most relevant result. Group by type if multiple types appear.

After the list, write a 1–2 sentence recommendation on which package best fits the user's stated goal and why.

### Step 5 — Offer next steps

Ask the user:

- Would you like to install one of these?
- Would you like to refine the search?

If they want to install, the command is:

```bash
aipkg <type> <org_namespace>/<slug>
```

$ARGUMENTS

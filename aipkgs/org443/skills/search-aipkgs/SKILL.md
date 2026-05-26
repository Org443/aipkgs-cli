---
name: search-aipkgs
description: Search and discover packages in the AIpkgs registry. Use this whenever the user runs `/search-aipkgs`, asks what aipkgs exist, wants to find a command/skill/rule/subagent/box, or asks to explore the registry at app.aipkgs.com.
allowed-tools: Bash, Read
allowed-commands:
  - curl *
  - cat aipkg.json
  - test -f aipkg.json
---

# Context

[AIpkgs](https://app.aipkgs.com) is an AI agent registry — like NPM but for AI building blocks. Packages are versioned, namespaced under an org, and installable via the `aipkg` CLI.

**Package types (DB short form — use these as the `type=` filter value):**

| Type     | What it is                                  | URL segment on app.aipkgs.com |
|----------|---------------------------------------------|-------------------------------|
| `cmd`    | Slash command (e.g. `/pr-create`)           | `/packages/commands/...`      |
| `skill`  | Reusable prompt/skill loaded on demand      | `/packages/skills/...`        |
| `rule`   | Always-on behavior rule injected in context | `/packages/rules/...`         |
| `agent`  | Specialist subagent                         | `/packages/agents/...`        |
| `box`    | MCP server / tool box                       | `/packages/boxes/...`         |
| `memory` | Persistent memory entry                     | `/packages/memory/...`        |

**Package ref shapes:** `<org>/<slug>` or `<org>/<key>/<slug>` (when packages are namespaced under a key).

# API

Base URL: `https://api.aipkgs.com`

## List / search

```
GET /v1/packages
  ?search=<query>     # optional, ILIKE match against key/slug/description/tags
  &type=<type>        # optional, one of: cmd | skill | rule | agent | box | memory
  &org=<namespace>    # optional, filter to a single org
  &limit=<n>          # optional, default 25, max 100
  &cursor=<cursor>    # optional, opaque pagination token from `next_cursor`
```

Response shape (see `assets/example-list-response.json` for a full example):

```json
{
  "packages": [
    {
      "package": {
        "id": "...",
        "org_namespace": "org443",
        "key": null,
        "slug": "pr-create",
        "type": "cmd",
        "visibility": "public",
        "tags": ["git", "github"],
        "supports": ["claude"],
        "latest_version": "0.2.1",
        "latest_version_created_at": 1716400000000,
        "total_downloads": 142,
        "total_likes": 18,
        "recent_likes": 4,
        "created_at": 1715000000000,
        "updated_at": 1716400000000
      },
      "app_url": "https://app.aipkgs.com/packages/commands/org443/pr-create"
    }
  ],
  "next_cursor": "eyJsYXN0VmFsdWVzIjpbLi4uXX0="
}
```

## Read a specific package version

Use these when the user wants to inspect a package before installing:

```
GET /v1/packages/<type>/<org>/<slug>/<version>/aipkg.json     # manifest
GET /v1/packages/<type>/<org>/<slug>/<version>/tree.json      # file listing
GET /v1/packages/<type>/<org>/<slug>/<version>/integrity.json # checksum
GET /v1/packages/<type>/<org>/<slug>/<version>/archive.tgz    # tarball
```

For packages with a `key`, insert it between org and slug: `/<type>/<org>/<key>/<slug>/<version>/...`.

# Your Task

The user's intent: **$ARGUMENTS**

Help them discover and evaluate the right package(s). Be a guide — narrow as you go.

## Step 0 — Read the local manifest (already-installed set)

Before searching, check whether the current project has an `aipkg.json` manifest. Installed packages live under `deps.<type>.<slug>` with values like `aipkg://<type>/<org>/<slug>@<version>`.

```bash
test -f aipkg.json && cat aipkg.json
```

If no `aipkg.json` exists, skip this step — there are no installed packages to dedupe against.

If it exists, build an **installed-set**: parse each `aipkg://...` value into `{ type, org, slug, version }`. The manifest uses pluralized buckets; map them to the API `type=` value:

| Manifest bucket | API type |
|-----------------|----------|
| `cmds`          | `cmd`    |
| `skills`        | `skill`  |
| `subagents`     | `agent`  |
| `rules`         | `rule`   |
| `mcps`          | `box`    |

Also accept the embedded `type` segment from the `aipkg://<type>/...` URI as the source of truth when it disagrees with the bucket name.

Keep the installed-set in memory through the rest of the conversation — every recommendation should be checked against it.

## Step 1 — Understand intent

Parse `$ARGUMENTS`. If empty or vague (just "search" or "what's there"), ask one focused question:

> What are you trying to do? Briefly describe the task — I'll find the best command, skill, rule, or subagent for it.

From the response, identify:

- **Task** — the job to be done (e.g. "open a PR", "review code", "summarize Slack")
- **Type preference** — did they say "command", "skill", "rule", "agent", "box"? Map to the DB short form.
- **Keywords** — 1-3 short terms for `search=`. Prefer single words; the API does ILIKE matching across key, slug, description, and tags.

## Step 2 — Search

Always URL-encode the query. Start broad, narrow with filters.

```bash
curl -s "https://api.aipkgs.com/v1/packages?search=<encoded-query>&limit=25"
```

If the user named a type, also run the type-filtered query:

```bash
curl -s "https://api.aipkgs.com/v1/packages?search=<encoded-query>&type=<type>"
```

If the first query returns 0 or very few hits:

1. **Drop the type filter** if one was applied.
2. **Try a shorter or related keyword** (e.g. "review" → "pr", "lint" → "format").
3. **List the whole type with no search** if the user is browsing (`?type=skill&limit=25`).

If hits exceed ~10, prefer to **filter further** (add `type=` or a more specific keyword) rather than dump all of them.

## Step 3 — Evaluate

For each promising result, you have everything you need in the list response (`slug`, `description` via tags, `type`, `latest_version`, `total_downloads`, `total_likes`, `app_url`). Only fetch the manifest if the user wants details that the list response doesn't expose (full description, deps, file tree):

```bash
curl -s "https://api.aipkgs.com/v1/packages/<type>/<org>/<slug>/<version>/aipkg.json"
```

Rank by relevance to the stated task first; use `total_downloads` and `recent_likes` as tiebreakers, not as the primary sort.

## Step 4 — Cross-check against the installed-set

For every candidate before showing it, check the installed-set from Step 0. A match is `(type, org, slug)` — version differences still count as installed.

- **Already installed** (match found): Do **not** suggest re-installing. Tag it `✓ installed (v<installed-version>)` in the output and lead with what it does, not how to install it. If the registry has a newer `latest_version`, mention the upgrade command instead: `aipkg update <type> <org>/<slug>`.
- **Not installed**: show the normal install command.

If **every** top result is already installed, call that out directly before the list:

> You already have the strongest matches for this task installed: `<a>`, `<b>`. Want me to broaden the search to find alternatives, or show you how to use one of these?

## Step 5 — Present recommendations

Show the top 3-5 matches grouped by type. Lead with the strongest fit. Format each result like this:

```
### <org>/<slug>  ·  <type>  ·  v<latest_version>   [✓ installed (v<installed-version>) | (not installed)]
<one-line summary of what it does>

· Downloads: <total_downloads>   · Likes: <total_likes>
· App: <app_url>
· Install:  aipkg <type> <org>/<slug>                  # only when NOT installed
· Upgrade:  aipkg update <type> <org>/<slug>           # only when installed and out-of-date
```

After the list, write 1-2 sentences explaining **which one to pick and why** for the user's specific task. Be direct — don't hedge between equally-good options without a reason. If the best fit is already installed, say so: *"You already have `<x>` — use it via `<how>`."*

If nothing fits well, say so plainly: "Nothing in the registry matches `<query>` closely. Closest neighbors are `<X>` and `<Y>`. Want me to broaden the search, or are you looking to publish your own?"

## Step 6 — If the user refines to a specific package

When the user names or zeroes in on a single package (e.g. "tell me more about `pr-create`", "I want that first one"), re-check the installed-set for that exact `(type, org, slug)`:

- **Installed** — say so first, before doing anything else:

  > Heads up: `<org>/<slug>` is already installed in this project (v<version>, declared under `deps.<bucket>.<alias>` in `aipkg.json`). No need to install it again.

  Then offer the next useful thing instead: show how to invoke it, fetch its manifest to explain what it does, or upgrade it if a newer version exists.

- **Not installed** — proceed with the normal install offer.

## Step 7 — Offer next steps

Ask exactly one of:

- "Want me to install `<recommended>`? Run: `aipkg <type> <org>/<slug>`"   *(only if not installed)*
- "Want me to upgrade `<recommended>` from v<installed> → v<latest>?"     *(only if installed and out-of-date)*
- "Want to see more matches? I can broaden the query or page through results with the `next_cursor`."
- "Want the full manifest for `<slug>`? I'll fetch it."

Pick the one question that best matches the situation — don't ask all four.

# Example interactions

See `assets/` for worked examples:

- `assets/example-list-request.sh` — sample curl invocations
- `assets/example-list-response.json` — sample search response
- `assets/example-manifest-response.json` — sample `aipkg.json` for one package
- `assets/example-installed-manifest.json` — sample local `aipkg.json` with deps already installed
- `assets/example-conversation.md` — full user-assistant turns including the "already installed" case

# Guardrails

- Use only `https://api.aipkgs.com` — never make up package refs or URLs.
- If a `curl` fails (non-200, empty body), report the status and don't fabricate results.
- Don't recommend a package the registry didn't return.
- Don't install anything for the user without their explicit yes.
- Never suggest installing a package that's already in the local `aipkg.json` — surface that fact instead.

$ARGUMENTS

# Example conversation

A worked example of how `search-aipkgs` should drive a conversation.

---

**User:** `/search-aipkgs help me open a pull request`

**Assistant:** *(Step 0: reads local `aipkg.json` — see `example-installed-manifest.json`. Installed-set includes `cmd/org443/pr-create@0.2.0` and `skill/anthropic/code-review@1.3.0`.)*

```bash
curl -s "https://api.aipkgs.com/v1/packages?search=pr&type=cmd&limit=25"
```

*(receives the response in `example-list-response.json`)*

Heads up: `org443/pr-create` is already installed in this project (v0.2.0). I'll flag it below — no need to re-install.

Found 3 matches. Top picks for opening a PR:

### org443/pr-create  ·  cmd  ·  v0.2.1   ✓ installed (v0.2.0)
Create a GitHub PR from the current branch — detects base, merges latest, drafts a structured body.

- Downloads: 142   · Likes: 18
- App: https://app.aipkgs.com/packages/commands/org443/pr-create
- Upgrade: `aipkg update cmd org443/pr-create`   *(installed v0.2.0 → latest v0.2.1)*

### org443/github/stack-pr  ·  cmd  ·  v0.0.4   (not installed)
Open stacked PRs against a base branch.

- Downloads: 31   · Likes: 5
- App: https://app.aipkgs.com/packages/commands/org443/github/stack-pr
- Install: `aipkg cmd org443/github/stack-pr`

**Recommendation:** You already have `org443/pr-create`, which is the right tool for the common single-PR flow — just run `/pr-create`. There's a v0.2.1 available if you want the latest. Pick `stack-pr` only if you regularly ship stacked PRs.

Want me to upgrade `org443/pr-create` from v0.2.0 → v0.2.1?

---

**User:** "what skills are there for code review?"

**Assistant:**

```bash
curl -s "https://api.aipkgs.com/v1/packages?search=review&type=skill&limit=25"
```

Top match:

### anthropic/code-review  ·  skill  ·  v1.4.0
Review the current diff for correctness bugs at the given effort level.

- Downloads: 980   · Likes: 122
- App: https://app.aipkgs.com/packages/skills/anthropic/code-review
- Install: `aipkg skill anthropic/code-review`

This is the most-downloaded review skill by a wide margin and supports tunable effort levels. Want me to install it, or fetch the full manifest first?

---

**User:** `/search-aipkgs`  *(no arguments)*

**Assistant:** What are you trying to do? Briefly describe the task — I'll find the best command, skill, rule, or subagent for it.

---

**User:** `/search-aipkgs slack`

**Assistant:** *(broad search, no type filter)*

```bash
curl -s "https://api.aipkgs.com/v1/packages?search=slack&limit=25"
```

*(receives empty response)*

Nothing matches `slack` directly in the public registry. Want me to try related keywords like `messaging`, `notify`, or `summary`, or browse all skills with no filter?

---

### Refining to a single already-installed package

**User:** "Actually I just want `code-review`."

**Assistant:** *(checks installed-set: `skill/anthropic/code-review@1.3.0` is already in `deps.skills`)*

Heads up: `anthropic/code-review` is already installed in this project (v1.3.0, declared under `deps.skills.code-review` in `aipkg.json`). No need to install it again.

A newer version (v1.4.0) is available — want me to upgrade?

```bash
aipkg update skill anthropic/code-review
```

Otherwise you can invoke the installed version directly through the skill (e.g. ask Claude to "review the current diff").

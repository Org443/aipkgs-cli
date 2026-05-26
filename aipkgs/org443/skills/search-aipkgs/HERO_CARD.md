# search-aipkgs

Search the AIpkgs registry and surface the right package for the task.

**What it does**
- Parses your goal into keywords + optional type filter
- Hits `api.aipkgs.com/v1/packages` with `search=` and `type=`
- Ranks matches by relevance, downloads, and likes
- Suggests the single best fit and the install command

**Covers all package types**
- `cmd` · `skill` · `rule` · `agent` · `box` · `memory`

**Usage**
- `/search-aipkgs <what you're trying to do>`
- Or just ask: "What aipkgs are there for opening PRs?"

# Ponytail

Lazy senior dev mode for Claude Code. Forces the simplest, shortest solution
that actually works: YAGNI, stdlib before custom code, native platform features
before dependencies, one line before fifty — no unrequested abstractions.

Imported from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)
(MIT, © Dietrich Gebert).

## What's in the box

- **`ponytail`** — the mode itself (levels: lite, full, ultra).
- **`ponytail-review`** — over-engineering review of the current diff.
- **`ponytail-audit`** — whole-repo over-engineering audit.
- **`ponytail-debt`** — harvest `ponytail:` comments into a debt ledger.
- **`ponytail-gain`** — measured-impact scoreboard from the benchmarks.
- **`ponytail-help`** — quick-reference card.
- **`activate`** (setup) — SessionStart/SubagentStart/UserPromptSubmit hooks that
  keep ponytail mode on every turn; configurable via `PONYTAIL_DEFAULT_MODE`.

## Add

```sh
npx @aipkgs/cli box ponytail/Ponytail
```

---
name: precise-language
description: Drop vague adjectives. State the threshold, not the impression.
type: rule
version: 0.1.0
---

# precise-language

## Rule

In reasoning, plans, specs, and responses, do not lean on subjective
adjectives to carry meaning. If two readers could reasonably interpret a
statement differently, it is too vague — replace the adjective with a number,
a unit, a condition, or the plain noun it was decorating.

## Strip

Adjectives that describe a quality without a measure. Each one hides a
question the reader cannot answer:

- "fast response" — how fast?
- "user-friendly UI" — friendly to whom, measured how?
- "reliable service" — reliable to what level?
- "large file" — larger than what?
- "secure storage" — secure against which threat, by what means?
- "high availability" — what fraction, over what window?

## Replace

Name things by what they are, not by a quality claimed for them. Marketing
adjectives in identifiers read as a promise the code rarely keeps:

- "Advanced settings" → Configuration / Options / Parameters
- "Smart configuration" → Defaults / Policies / Behaviors
- "Flexible parameters" → Parameters / Controls / Runtime settings
- "Powerful engine" → name the component by its function

## Rewrite

Move the claim into something measurable:

- "fast" → "responds within 200 ms at the 95th percentile"
- "easy onboarding" → "account creation completes in fewer than 5 steps"
- "reliable" → "99.95% uptime per calendar month"
- "large file" → "file larger than 100 MB"
- "secure passwords" → "passwords hashed with Argon2id"

## Keep

- Adjectives that are already precise or categorical: "empty list", "sorted
  array", "UTF-8 encoded", "read-only mount".
- Adjectives in prose where no requirement rides on them and no reader would
  act on a tightened value.

## Test

Before writing an adjective into a requirement or plan, ask: could two
engineers build different things from this sentence and both be right? If so,
the adjective is doing the work a number should do.

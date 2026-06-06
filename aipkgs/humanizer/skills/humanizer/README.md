# humanizer

A Claude Code skill that detects and removes signs of AI-generated writing,
making text sound more natural and human. It scans for patterns drawn from
Wikipedia's "Signs of AI writing" guide — inflated symbolism, promotional
language, em dash overuse, the rule of three, AI vocabulary, passive voice,
negative parallelisms, filler phrases, and more — and rewrites them.

## Attribution

Imported from [blader/humanizer](https://github.com/blader/humanizer) by
Siqi Chen. Licensed under MIT (see `LICENSE.txt`). The skill content in
`SKILL.md` is preserved verbatim from upstream.

## Install

```sh
npx @aipkgs/cli skill humanizer/humanizer
```

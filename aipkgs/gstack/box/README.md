# Gstack

[gstack](https://github.com/garrytan/gstack) by Garry Tan, packaged as an
AIpkgs box: 58 Claude Code skills spanning the full ship workflow — QA and
design review (`qa`, `design-review`, `devex-review`, `plan-*-review`),
planning and investigation (`autoplan`, `investigate`, `learn`, `retro`),
iOS workflows (`ios-fix`, `ios-qa`, `ios-design-review`, …), deploys
(`land-and-deploy`, `setup-deploy`, `ship`), document generation, and a
headless browser for dogfooding (`browse`, `scrape`, `open-gstack-browser`).

Each skill is published independently as `gstack/<name>` (see `../skills/<name>/`);
this box bundles all 58 by referencing them as dependencies, so installing the
box installs the whole set. Skills also declare their own workflow dependencies
— e.g. installing `autoplan` pulls in the four `plan-*-review` skills it drives,
and `guard` pulls in `careful` and `freeze` — so a single skill installs with
everything it needs to run.

## Note on the gstack CLI

Many skills drive the `gstack` command-line tool (`bin/gstack-*`), which is the
upstream gstack toolchain installed separately — see the upstream repo. This box
vendors the Claude skill instructions; install gstack itself to use the skills
that shell out to it.

## Attribution

Imported from [garrytan/gstack](https://github.com/garrytan/gstack). Licensed
under MIT (see `LICENSE.txt`).

## Install

```sh
aipkg install gstack/Gstack
```

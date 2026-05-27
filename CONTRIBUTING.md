# Contributing

Contributions and discussion are very welcome.

[AIpkgs](https://aipkgs.com) is new, and almost nothing about it is settled — the packaging model, the manifest schema, how collisions resolve, are all decisions made by Org443, alone... :alone: And programming in a vacuum is rarely a good idea, so please share ideas, push back on the design, file bugs, and tell us what's missing.

For now, the main place to start a discussion, open a pull request, or file a feature request is the [GitHub repo](https://github.com/Org443/aipkgs-cli).

## Development

This repo is an npm-workspaces monorepo. Node 26+ is required.

```sh
npm install
npm test           # run the test suite
npm run typecheck  # type-check every workspace
npm run lint       # biome lint
npm run dev        # run the CLI locally from packages/cli
```

Before opening a pull request, make sure `npm test`, `npm run typecheck`, and `npm run lint` all pass.

## Sharing your own packages

If you've built skills, agents, boxes, or anything else worth sharing, publish them to the [AIpkgs](https://aipkgs.com) registry with `aipkg publish` so others can install them and build on top of them. The ecosystem grows faster when packages are modular and shared.

> Happy AI pkg shipping!

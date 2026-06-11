# worktree

Create a fully-functional git worktree for a branch in an npm project.

Places the worktree in a `<repo>.worktrees/` directory next to the repo, then
recreates the developer setup so the worktree behaves like the checkout it was
created from: copies `.env*` and other local config files, runs `npm install`,
and rebuilds the AI setup via `npx @aipkgs/cli install` when an
`aipkg.json` is present. Also removes worktrees (`-d`).

# node-general

General Node + TypeScript coding rules.

**Covers**
- Function signatures: named (object) `args`, early destructure
- `ctx` threading as first positional argument
- Call style: no nested function calls as arguments
- Concurrency: `pMap` with inline `concurrency` over `Promise.all`
- File layout: exports first, ~300-line split signal
- Dates: `dayjs` over `Date` arithmetic
- TypeScript: no single-use types, no return-type annotations when inference works

**Pairs with:** `node-workspaces` for monorepo workspace structure.

---
paths: "**/*.{.ts,tsx}"
---

# Node + TypeScript General Coding Rules

Apply these rules when writing any Node + TypeScript code.

## TypeScript

> ### ⚠️ AVOID INTERMEDIATE TYPES
> **Do not invent new types if not necessary** Use the existing types and object.  Do not destructure and existing type and rename the properties to form a new type.  It good to pass around original objects with direct lineage.  
> Do not do this
```ts
// exiting types
type Foo = { a: string, foo: string } 
type Bar = { b: string, bar: string }

//Bad intermediate type
type FooBar = {
  fooA: string
  fooFoo: string
  barB: string
  barBar: string
}

function example(args: { foo: Foo, bar: Bar}): FooBar {
 const { foo, bar }

 // This is BAD
 return {
  fooA: foo.a,
  fooFoo: foo.foo,
  barB: bar.b,
  barBar: barBar
 }
}
```
> Instead we should just use the type `Foo` and `Bar`.  The `example(): FooBar` just serves as misdirection.

- **Don't annotate return types when inference works.** Only annotate when inference is wrong, the function is a stable public surface, or the inferred type is so wide it actually helps readers.

## Function signatures

- **Named (object) args** for any function with >1 parameter: `foo({ bar, baz })`, not `foo(bar, baz)`. Applies to service functions, helpers, and constructors alike. Single-arg functions can stay positional.
- **Destructure early.** Pull fields off the input at the top of the function, then use bare names below — don't dot-reference `args.x` throughout the body.
- **Use `args`** as the parameter name: `function foo(args: { foo: string; bar: number }) { const { foo, bar } = args; ... }`.

## Context plumbing

- Thread a context object as the **first positional argument** to service-level methods: `service.do(ctx, input)`.
- `ctx` carries request-scoped infrastructure (logger, db connection, tracing, auth) — it stays positional, separate from the named `input` / `args` object.

## Call style

- **Don't nest function calls as arguments.** Assign the inner result to a named local first — better for debugging, stack traces, and inserting log lines.
  - Good: `const b = bar(); foo(b);`
  - Bad: `foo(bar())`

## Concurrency

- Use **`pMap` from `p-map` with an inline `concurrency`** when fanning out work over a collection. `Promise.all` over N items can exhaust DB pool connections, sockets, file handles, or rate limits.
- Keep the `concurrency` literal at the call site — don't extract to a constant unless it's referenced more than once — so the ceiling is visible next to the work it bounds.
- `Promise.all` over a fixed hand-written tuple of unrelated calls is fine; the parallelism is bounded by arity.

## File layout

- **Exports at the top, helpers below.** Readers should see the public surface first. JS hoists function declarations, so forward-referencing a helper is fine.
- **Soft ~300-line trigger** for splitting a file: if it holds multiple named sub-units, pull them into their own files. A single cohesive unit that genuinely needs the space is fine.

## Dates and time

- Use `dayjs` for all dates, durations, and other time values. Don't reach for `Date` arithmetic, `Intl.DateTimeFormat`, or ad-hoc helpers.

## Don'ts (quick reference)

- **Avoid intermediate types.** No named `type` / `interface` to glue adjacent functions together — inline the shape.
- Don't annotate return types when inference works.
- Don't nest function calls as arguments.
- Don't use `Promise.all` to fan out over a collection — use `pMap`.
- Don't reach for `Date` arithmetic — use `dayjs`.

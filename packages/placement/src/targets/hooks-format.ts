import type { HookMatcher, HooksByEvent } from '@local/archive';

// Shared hook plumbing used by every target. The package's `setup.json` is
// parsed into an event map by `@local/archive` (`parseSetup`); the helpers here
// resolve `${PKG_ROOT}` and track per-slug ownership, which are identical across
// agents. Only the destination config file differs (Claude merges into
// `.claude/settings.local.json`). Each target's config module owns the file I/O
// and calls into these pure helpers.

// Authored hook commands reference their own placed scripts via `${PKG_ROOT}`,
// which we rewrite to the hook's install directory at placement time.
export const REF_TOKEN = /\$\{PKG_ROOT\}/g;

// Rewrite `${PKG_ROOT}` in every hook command to the hook's install directory.
export function substituteRef(args: { events: HooksByEvent; installDir: string }): HooksByEvent {
  const { events, installDir } = args;
  const out: HooksByEvent = {};
  for (const [event, matchers] of Object.entries(events)) {
    out[event] = matchers.map((matcher) => ({
      ...matcher,
      hooks: matcher.hooks.map((hook) =>
        hook.command === undefined ? hook : { ...hook, command: hook.command.replace(REF_TOKEN, installDir) },
      ),
    }));
  }
  return out;
}

// Merge a slug's incoming matchers into an existing event map, tagging each with
// its owner so reinstalls replace prior entries and removes can target one slug.
export function mergeOwnedHooks(args: { existing: HooksByEvent; incoming: HooksByEvent; slug: string }): HooksByEvent {
  const { existing, incoming, slug } = args;
  const out: HooksByEvent = { ...existing };
  for (const [event, matchers] of Object.entries(incoming)) {
    const tagged = matchers.map((m) => ({ ...m, [AIPKG_OWNER_KEY]: slug }));
    const bucket = out[event] ?? [];
    const kept = bucket.filter((m) => !isOwnedBy({ matcher: m, slug }));
    out[event] = [...kept, ...tagged];
  }
  return out;
}

// Strip every matcher owned by `slug`, dropping now-empty events. `changed`
// reports whether anything was removed so callers can avoid needless writes.
export function removeOwnedHooks(args: { existing: HooksByEvent; slug: string }): {
  hooks: HooksByEvent;
  changed: boolean;
} {
  const { existing, slug } = args;
  let changed = false;
  const rebuilt: HooksByEvent = {};
  for (const [event, matchers] of Object.entries(existing)) {
    const after = matchers.filter((m) => !isOwnedBy({ matcher: m, slug }));
    if (after.length !== matchers.length) changed = true;
    if (after.length > 0) rebuilt[event] = after;
  }
  return { hooks: rebuilt, changed };
}

////
/// Helpers
//

export const AIPKG_OWNER_KEY = '__aipkg';

function isOwnedBy(args: { matcher: HookMatcher; slug: string }): boolean {
  const { matcher, slug } = args;
  return (matcher as { [AIPKG_OWNER_KEY]?: string })[AIPKG_OWNER_KEY] === slug;
}

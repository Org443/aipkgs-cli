import type { ArchiveSetup } from './validate/setup.ts';

// The reserved capability tags a setup bundle can advertise, mapped to their
// display label. A setup is unlike the other archive types — instead of adding
// a prompt asset it configures the agent — so `archiveService.parse` detects
// which of these capabilities it carries and folds the matching tag(s) into the
// manifest's `tags` (see `withSetupFeatureTags`). The frontend renders them as
// distinct chips. These string values are the canonical contract between the
// publish path and the UI; user tags must not collide with them.
export const SETUP_FEATURE_TAGS = {
  hooks: 'Hooks',
  mcp: 'MCP',
  statusline: 'StatusLine',
} as const;

export type SetupFeatureTag = keyof typeof SETUP_FEATURE_TAGS;

// Merge a setup bundle's auto-detected capability tags into its user-supplied
// tags, preserving the user tags (and their order) and de-duplicating. This is
// the only entry point the rest of the package needs: `archiveService.parse`
// calls it so the emitted manifest carries both kinds of tag and consumers just
// read `manifest.tags` — they never run capability detection themselves.
export function withSetupFeatureTags(args: { tags?: string[]; setup: ArchiveSetup }) {
  const { tags = [], setup } = args;
  const featureTags = setupFeatureTags(setup);
  return [...new Set([...tags, ...featureTags])];
}

////
/// Helpers
//

// Derive which capability tags a parsed setup bundle carries: `hooks` when it
// defines any hook events, `mcp` when it declares MCP servers, and
// `statusline` when it ships a status line config. Empty objects count as
// absent — an author writing `"statusLine": {}` is advertising nothing.
function setupFeatureTags(setup: ArchiveSetup) {
  const { events, mcps, statusLine } = setup;

  const tags: SetupFeatureTag[] = [];
  if (Object.keys(events).length > 0) tags.push('hooks');
  if (mcps && Object.keys(mcps).length > 0) tags.push('mcp');
  if (statusLine && Object.keys(statusLine).length > 0) tags.push('statusline');
  return tags;
}

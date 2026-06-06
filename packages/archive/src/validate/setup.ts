import { z } from 'zod';
import { InvalidArchive } from '../errors.ts';
import type { Manifest } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';
import { pruneCruft } from './prune.ts';
import { assertRequiredFile, isPayloadFile } from './shared.ts';

export const SETUP_FILENAME = 'setup.json';

type HookCommand = {
  type?: string;
  command?: string;
  timeout?: number;
};

export type HookMatcher = {
  matcher?: string;
  hooks: HookCommand[];
};

export type HooksByEvent = Record<string, HookMatcher[]>;

export const McpEntryZ = z.object({
  url: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export type McpEntry = z.output<typeof McpEntryZ>;

// A setup bundle decoded into the universal archive shape. `setup.json` carries
// the hook event map, an optional statusLine, and any MCP server definitions;
// `scripts` are the bundle's own payload files (e.g. under `scripts/`) that the
// hooks invoke.
export type ArchiveSetup = {
  events: HooksByEvent;
  statusLine?: Record<string, unknown>;
  mcps?: Record<string, McpEntry>;
  scripts: TarEntry[];
};

export function assertSetupArchive(args: { manifest: Manifest; files: TarEntry[] }): ArchiveSetup {
  return parseSetup({ files: args.files });
}

// Parse and validate a setup bundle's file set: locate `setup.json`, decode it
// into an event map (plus optional statusLine and mcps), and split out the
// remaining payload `scripts`. This is the single source of truth for a setup
// bundle's shape — both `assertSetupArchive` and the box validator call it, so
// the `setup.json` filename and its JSON shape never leak out of this package.
export function parseSetup(args: { files: TarEntry[] }): ArchiveSetup {
  const { files } = args;

  const pruned = pruneCruft(files);

  const entry = assertRequiredFile({ files: pruned, path: SETUP_FILENAME, archiveType: 'setup' });
  const { events, statusLine, mcps } = parseSetupConfig(entry.body);

  // Scripts are the bundle's own payload — everything except setup.json, the
  // manifest, and the metadata sidecars.
  const scripts = pruned.filter((f) => f.path !== SETUP_FILENAME && isPayloadFile(f.path));

  return { events, statusLine, mcps, scripts };
}

////
/// Helpers
//

// Accepts the bare event map ({ PreToolUse: [...] }) or the wrapper shape
// ({ hooks: { ... }, statusLine: {...}, mcps: {...} }). statusLine and mcps are
// only valid inside the wrapper — a top-level statusLine alongside a bare event
// map would be ambiguous with an event name.
function parseSetupConfig(body: Buffer): {
  events: HooksByEvent;
  statusLine?: Record<string, unknown>;
  mcps?: Record<string, McpEntry>;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString());
  } catch (err) {
    throw new InvalidArchive({
      message: `setup archive ${SETUP_FILENAME} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  if (!isPlainObject(parsed)) {
    throw new InvalidArchive({
      message: `setup archive ${SETUP_FILENAME} must be a JSON object keyed by hook event name`,
    });
  }

  const isWrapper = 'statusLine' in parsed || 'mcps' in parsed;
  if (isWrapper) {
    const extraKeys = Object.keys(parsed).filter((k) => k !== 'hooks' && k !== 'statusLine' && k !== 'mcps');
    if (extraKeys.length > 0) {
      throw new InvalidArchive({
        message: `setup archive ${SETUP_FILENAME}: statusLine and mcps are only allowed inside the wrapper shape ({ "hooks": {...}, "statusLine": {...}, "mcps": {...} }), not alongside a bare event map`,
      });
    }

    const events = isPlainObject(parsed.hooks) ? parsed.hooks : {};
    assertEventArrays(events);

    const statusLine = parseStatusLine(parsed.statusLine);
    const mcps = parseMcps(parsed.mcps);
    return { events: events as HooksByEvent, statusLine, mcps };
  }

  // Bare event map ({ PreToolUse: [...] }), or the wrapper shape with only
  // `hooks` — unwrap the latter so authors can paste straight from a settings file.
  const events = isPlainObject(parsed.hooks) ? parsed.hooks : parsed;
  assertEventArrays(events);
  return { events: events as HooksByEvent };
}

function parseStatusLine(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw new InvalidArchive({ message: `setup archive ${SETUP_FILENAME}: statusLine must be a JSON object` });
  }
  return value;
}

function parseMcps(value: unknown): Record<string, McpEntry> | undefined {
  if (value === undefined) return undefined;
  const result = McpsZ.safeParse(value);
  if (!result.success) {
    throw new InvalidArchive({
      message: `setup archive ${SETUP_FILENAME}: mcps must be a map of MCP server definitions`,
    });
  }
  return result.data;
}

function assertEventArrays(events: Record<string, unknown>) {
  for (const [event, matchers] of Object.entries(events)) {
    if (!Array.isArray(matchers)) {
      throw new InvalidArchive({
        message: `setup archive ${SETUP_FILENAME} event "${event}" must be an array of matcher objects`,
      });
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const McpsZ = z.record(z.string(), McpEntryZ);

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type AIpkgArchive, MANIFEST_FILENAME, type Manifest, type TarEntry } from '@local/archive';
import { type HooksByEvent, settingsConfig } from './settings-config.ts';

const HOOKS_JSON_FILENAME = 'hooks.json';

export async function install(args: { archive: AIpkgArchive; slug: string }) {
  const { archive, slug } = args;
  const { type } = archive.manifest;
  const files = archive.files.filter((f) => f.path !== MANIFEST_FILENAME);

  return installFiles({ type, slug, files, srcSlug: archive.pkgRef.slug });
}

export async function installFiles(args: {
  type: Manifest['type'];
  slug: string;
  files: TarEntry[];
  srcSlug?: string;
}) {
  const { type, slug, files, srcSlug = slug } = args;

  if (type === 'hook') return installHook({ slug, files });

  const path = pathFor({ type, slug });

  const written: string[] = [];

  if (type === 'skill') {
    for (const entry of files) {
      const dest = join(path, entry.path);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, entry.body);
      written.push(dest);
    }
    return { written };
  }

  await mkdir(dirname(path), { recursive: true });

  const primary = `${srcSlug}.md`;
  const file = files.find((f) => f.path === primary);
  if (!file) throw new Error(`Archive for ${type}/${slug} is missing ${primary}`);

  await writeFile(path, file.body);
  written.push(path);

  return { written };
}

export async function remove(args: { type: Manifest['type']; slug: string }): Promise<{ path: string }> {
  const path = pathFor(args);
  await rm(path, { recursive: true, force: true });
  if (args.type === 'hook') {
    await settingsConfig.removeHooks({ slug: args.slug });
  }
  return { path };
}

async function installHook(args: { slug: string; files: TarEntry[] }) {
  const { slug, files } = args;
  const path = pathFor({ type: 'hook', slug });

  const hooksEntry = files.find((f) => f.path === HOOKS_JSON_FILENAME);
  if (!hooksEntry) throw new Error(`Hook archive for "${slug}" missing ${HOOKS_JSON_FILENAME}`);

  const written: string[] = [];

  for (const entry of files) {
    if (entry.path === HOOKS_JSON_FILENAME) continue;
    const dest = join(path, entry.path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, entry.body);
    written.push(dest);
  }

  const { events, statusLine } = parseHooksJson({ slug, body: hooksEntry.body });
  // `${PKG_ROOT}` resolves to the hook's install directory so authored commands can
  // reference their own placed scripts regardless of the namespacing key.
  const installDir = ['.claude', 'hooks', slug].join('/');
  const resolved = substituteRef({ events, installDir });
  await settingsConfig.mergeHooks({ slug, hooks: resolved });
  written.push(settingsConfig.path());

  const resolvedStatusLine =
    statusLine && typeof statusLine.command === 'string'
      ? { ...statusLine, command: statusLine.command.replace(REF_TOKEN, installDir) }
      : statusLine;

  return { written, statusLine: resolvedStatusLine };
}

const REF_TOKEN = /\$\{PKG_ROOT\}/g;
function substituteRef(args: { events: HooksByEvent; installDir: string }): HooksByEvent {
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

function parseHooksJson(args: { slug: string; body: Buffer }): {
  events: HooksByEvent;
  statusLine?: Record<string, unknown>;
} {
  const { slug, body } = args;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString());
  } catch (err) {
    throw new Error(
      `Hook "${slug}" ${HOOKS_JSON_FILENAME} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`Hook "${slug}" ${HOOKS_JSON_FILENAME} must be a JSON object keyed by hook event name`);
  }

  // statusLine is only valid inside the wrapper shape ({ hooks: {...}, statusLine: {...} }) —
  // a top-level statusLine alongside a bare event map would be ambiguous with an event name.
  if ('statusLine' in parsed) {
    const extraKeys = Object.keys(parsed).filter((k) => k !== 'hooks' && k !== 'statusLine');
    if (extraKeys.length > 0) {
      throw new Error(
        `Hook "${slug}" ${HOOKS_JSON_FILENAME}: statusLine is only allowed inside the wrapper shape ({ "hooks": {...}, "statusLine": {...} })`,
      );
    }
    if (!isPlainObject(parsed.statusLine)) {
      throw new Error(`Hook "${slug}" ${HOOKS_JSON_FILENAME}: statusLine must be a JSON object`);
    }
    const events = isPlainObject(parsed.hooks) ? parsed.hooks : {};
    assertEventArrays({ slug, events });
    return { events: events as HooksByEvent, statusLine: parsed.statusLine };
  }

  // Accept either the bare event map ({ PreToolUse: [...] }) or the settings.json
  // wrapper shape ({ hooks: { PreToolUse: [...] } }) — unwrap the latter so authors
  // can paste straight from their settings file.
  const events = isPlainObject(parsed.hooks) ? parsed.hooks : parsed;
  assertEventArrays({ slug, events });
  return { events: events as HooksByEvent };
}

function assertEventArrays(args: { slug: string; events: Record<string, unknown> }) {
  const { slug, events } = args;
  for (const [event, matchers] of Object.entries(events)) {
    if (!Array.isArray(matchers)) {
      throw new Error(`Hook "${slug}" ${HOOKS_JSON_FILENAME} event "${event}" must be an array of matcher objects`);
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function pathFor(args: { type: Manifest['type']; slug: string }): string {
  const { type, slug } = args;
  const cwd = process.cwd();
  switch (type) {
    case 'cmd':
      return join(cwd, '.claude', 'commands', `${slug}.md`);
    case 'subagent':
      return join(cwd, '.claude', 'agents', `${slug}.md`);
    case 'rule':
      return join(cwd, '.claude', 'rules', `${slug}.md`);
    case 'skill':
      return join(cwd, '.claude', 'skills', slug);
    case 'hook':
      return join(cwd, '.claude', 'hooks', slug);
    case 'box':
      throw new Error('Cannot place a box package — boxes are imported via `aipkg box`, not installed');
    default:
      throw new Error(`We don't support placing ${type satisfies never}s yet`);
  }
}

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type AIpkgArchive, MANIFEST_FILENAME, type Manifest, type TarEntry } from '@local/archive';
import { type HooksByEvent, settingsConfig } from './settings-config.ts';

const HOOKS_JSON_FILENAME = 'hooks.json';

export async function install(args: { archive: AIpkgArchive; slug: string }) {
  const { archive, slug } = args;
  const { type } = archive.manifest;
  const files = archive.files.filter((f) => f.path !== MANIFEST_FILENAME);
  return installFiles({ type, slug, files });
}

export async function installFiles(args: { type: Manifest['type']; slug: string; files: TarEntry[] }) {
  const { type, slug, files } = args;

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

  const file = files[0];
  if (!file) throw new Error(`No files to place for ${type}/${slug}`);

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

  const parsed = parseHooksJson({ slug, body: hooksEntry.body });
  await settingsConfig.mergeHooks({ slug, hooks: parsed });
  written.push(settingsConfig.path());

  return { written };
}

function parseHooksJson(args: { slug: string; body: Buffer }): HooksByEvent {
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

  // Accept either the bare event map ({ PreToolUse: [...] }) or the settings.json
  // wrapper shape ({ hooks: { PreToolUse: [...] } }) — unwrap the latter so authors
  // can paste straight from their settings file.
  const events = isPlainObject(parsed.hooks) ? parsed.hooks : parsed;

  for (const [event, matchers] of Object.entries(events)) {
    if (!Array.isArray(matchers)) {
      throw new Error(
        `Hook "${slug}" ${HOOKS_JSON_FILENAME} event "${event}" must be an array of matcher objects`,
      );
    }
  }

  return events as HooksByEvent;
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

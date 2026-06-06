import { readFile, readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { type Manifest, SETUP_FILENAME, type TarEntry } from '@local/archive';
import { collectFlatFiles, collectSidecars, collectSingleFlat } from './collect-flat.ts';
import { collectSetupFile } from './collect-setup.ts';
import { collectSkillFiles } from './collect-skill.ts';
import { collectDir } from './walk.ts';

// Resolve a path provided on the CLI or in aipkg.json. Bare paths resolve
// against cwd. Returns the absolute path on disk.
export function resolveLocalPath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

export async function collectArchiveFiles(args: {
  type: Manifest['type'];
  dir: string;
  slug: string;
  manifestFilename?: string;
}): Promise<TarEntry[]> {
  const { type, dir, slug, manifestFilename } = args;
  const st = await stat(dir);
  if (!st.isDirectory()) {
    throw new Error(`Package path must be a directory: ${dir}`);
  }

  const assetFiles = await collectCoreFiles({ type, dir, slug, manifestFilename });
  const sidecars = await collectSidecars({ dir }); // README, LICENSE

  return [...sidecars, ...assetFiles];
}

async function collectCoreFiles(args: {
  type: Manifest['type'];
  dir: string;
  slug: string;
  manifestFilename?: string;
}): Promise<TarEntry[]> {
  const { type, dir, slug, manifestFilename } = args;
  switch (type) {
    case 'box':
      return collectBoxDirs({ root: dir });
    case 'skill': {
      const entries = await collectSkillFiles({ root: dir, manifestFilename });
      if (!entries) throw new Error(`Missing required file SKILL.md in ${dir}`);
      return entries;
    }
    case 'setup': {
      const entries = await collectSetupFile({ root: dir, manifestFilename });
      if (!entries) throw new Error(`Missing required file ${SETUP_FILENAME} in ${dir}`);
      return entries;
    }
    default:
      return collectSingleFlat({ root: dir, slug });
  }
}

async function collectBoxDirs(args: { root: string }): Promise<TarEntry[]> {
  const { root } = args;
  const out: TarEntry[] = [];

  // skills/<slug>/** — one skill bundle per slug dir.
  const skillsDir = join(root, 'skills');
  if (await isDirectory(skillsDir)) {
    const items = await readdir(skillsDir, { withFileTypes: true });
    for (const item of items) {
      if (!item.isDirectory()) continue; // Only collect the `<slug>/**` dirs.

      const slug = item.name;
      const entries = await collectSkillFiles({ root: join(skillsDir, slug) });
      if (!entries) continue;

      out.push(...prefixPaths(entries, `skills/${slug}`));
    }
  }

  // rules|subagents/<name>.md — flat *.md files directly under the dep dir.
  for (const depType of ['rules', 'subagents'] as const) {
    const depDir = join(root, depType);
    if (!(await isDirectory(depDir))) continue;

    const entries = await collectFlatFiles({ dir: depDir });
    out.push(...prefixPaths(entries, depType));
  }

  // A box carries its setup at the root as `setup.json` plus an optional
  // `scripts/` payload (mirroring the box archive layout) — not under a
  // `setups/` subdir like the manifest's deps key.
  out.push(...(await collectBoxSetup({ root })));

  return out;
}

async function collectBoxSetup(args: { root: string }): Promise<TarEntry[]> {
  const { root } = args;

  const setupPath = join(root, SETUP_FILENAME);
  const s = await stat(setupPath).catch(() => null);
  if (!s?.isFile()) return []; // No setup in this box.

  const out: TarEntry[] = [{ path: SETUP_FILENAME, body: await readFile(setupPath) }];

  const scriptsDir = join(root, 'scripts');
  if (await isDirectory(scriptsDir)) {
    const entries = await collectDir({ root: scriptsDir });
    out.push(...prefixPaths(entries, 'scripts'));
  }

  return out;
}

async function isDirectory(path: string): Promise<boolean> {
  const s = await stat(path).catch(() => null);
  return !!s?.isDirectory();
}

function prefixPaths(entries: TarEntry[], prefix: string): TarEntry[] {
  return entries.map((e) => ({ ...e, path: `${prefix}/${e.path}` }));
}

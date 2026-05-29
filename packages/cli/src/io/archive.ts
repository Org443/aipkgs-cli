import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { DEPS_KEYS, type Manifest, type TarEntry } from '@local/archive';
import { collectFlatFiles, collectSidecars, collectSingleFlat } from './collect-flat.ts';
import { collectHookFiles } from './collect-hooks.ts';
import { collectSkillFiles } from './collect-skill.ts';

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
    case 'hook': {
      const entries = await collectHookFiles({ root: dir, manifestFilename });
      if (!entries) throw new Error(`Missing required file hooks.json in ${dir}`);
      return entries;
    }
    default:
      return collectSingleFlat({ root: dir, slug });
  }
}

async function collectBoxDirs(args: { root: string }): Promise<TarEntry[]> {
  const { root } = args;
  const out: TarEntry[] = [];

  for (const depType of DEPS_KEYS) {
    if (depType === 'boxes') continue; // Boxes do not nest inside boxes.

    const depDir = join(root, depType);
    const keyStat = await stat(depDir).catch(() => null);
    if (!keyStat?.isDirectory()) continue;

    if (depType === 'skills') {
      const items = await readdir(depDir, { withFileTypes: true });
      for (const item of items) {
        if (!item.isDirectory()) continue; // Only collect the `<slug>/**` dirs.

        const slug = item.name;
        const dir = join(depDir, slug); // skills/<slug>/**

        const entries = await collectSkillFiles({ root: dir });
        if (!entries) continue;

        out.push(...prefixPaths(entries, `${depType}/${slug}`));
      }
    } else if (depType === 'hooks') {
      const entries = await collectHookFiles({ root: depDir });
      if (!entries) continue;

      out.push(...prefixPaths(entries, depType));
    } else {
      // cmds / rules / subagents: flat *.md files directly under keyDir.
      const entries = await collectFlatFiles({ dir: depDir });
      out.push(...prefixPaths(entries, depType));
    }
  }

  return out;
}

function prefixPaths(entries: TarEntry[], prefix: string): TarEntry[] {
  return entries.map((e) => ({ ...e, path: `${prefix}/${e.path}` }));
}

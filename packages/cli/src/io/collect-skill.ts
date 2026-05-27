import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { TarEntry } from '@local/archive';
import pc from 'picocolors';
import { collectDir } from './walk.ts';

// Pack a single skill directory. Requires a top-level `SKILL.md`; returns
// `null` if it's missing so callers (e.g. box packing) can warn and skip.
export async function collectSkillFiles(args: {
  root: string;
  manifestFilename?: string;
}): Promise<TarEntry[] | null> {
  const { root, manifestFilename } = args;

  const skillMd = join(root, 'SKILL.md');
  const s = await stat(skillMd).catch(() => null);
  if (!s?.isFile()) {
    console.warn(`Skipping ${pc.yellow(root)} because it is missing a SKILL.md file: ${skillMd}`);
    return null;
  }

  return collectDir({ root, manifestFilename });
}

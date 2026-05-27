import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { TarEntry } from '@local/archive';
import pc from 'picocolors';
import { collectDir } from './walk.ts';

// Pack a single hook directory. Requires a top-level `hooks.json`; returns
// `null` if it's missing so callers (e.g. box packing) can warn and skip.
export async function collectHookFiles(args: {
  root: string;
  manifestFilename?: string;
}): Promise<TarEntry[] | null> {
  const { root, manifestFilename } = args;

  const hooksJson = join(root, 'hooks.json');
  const s = await stat(hooksJson).catch(() => null);
  if (!s?.isFile()) {
    console.warn(`Skipping ${pc.yellow(root)} because it is missing a hooks.json file: ${hooksJson}`);
    return null;
  }

  return collectDir({ root, manifestFilename });
}

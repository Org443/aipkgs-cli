import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { SETUP_FILENAME, type TarEntry } from '@local/archive';
import pc from 'picocolors';
import { collectDir } from './walk.ts';

// Pack a single setup directory. Requires a top-level `setup.json`; returns
// `null` if it's missing so callers (e.g. box packing) can warn and skip.
export async function collectSetupFile(args: {
  root: string;
  manifestFilename?: string;
}): Promise<TarEntry[] | null> {
  const { root, manifestFilename } = args;

  const setupJson = join(root, SETUP_FILENAME);
  const s = await stat(setupJson).catch(() => null);
  if (!s?.isFile()) {
    console.warn(`Skipping ${pc.yellow(root)} because it is missing a ${SETUP_FILENAME} file: ${setupJson}`);
    return null;
  }

  return collectDir({ root, manifestFilename });
}

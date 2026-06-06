import { stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { TarEntry } from '@local/archive';
import { loadIgnore } from './ignore.ts';
import { collectDir } from './walk.ts';

// Resolve a path provided on the CLI or in aipkg.json. Bare paths resolve
// against cwd. Returns the absolute path on disk.
export function resolveLocalPath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

export async function collectArchiveFiles(args: {
  dir: string;
  manifestFilename?: string;
}): Promise<TarEntry[]> {
  const { dir, manifestFilename } = args;

  const st = await stat(dir);
  if (!st.isDirectory()) {
    throw new Error(`Package path must be a directory: ${dir}`);
  }

  const ignore = await loadIgnore({ dir });
  return collectDir({ root: dir, ignore, manifestFilename });
}

import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { MANIFEST_FILENAME, type TarEntry } from '@local/archive';
import { SIDECAR_FILENAMES } from './collect-flat.ts';

export async function collectDir(args: { root: string; manifestFilename?: string }): Promise<TarEntry[]> {
  const { root, manifestFilename } = args;
  const out: TarEntry[] = [];
  await walk({ root, dir: root, out, manifestFilename });
  return out;
}

async function walk(args: {
  root: string;
  dir: string;
  out: TarEntry[];
  manifestFilename?: string;
}): Promise<void> {
  const { root, dir, out, manifestFilename } = args;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk({ root, dir: full, out, manifestFilename });
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = relative(root, full).split(/[\\/]/).join('/');
    // Manifest is re-emitted from the in-memory `Manifest` by the archive
    // layer, so skip any on-disk copy (default name or caller-provided custom
    // name) to avoid duplicate entries.
    if (rel === MANIFEST_FILENAME) continue;
    if (manifestFilename && rel === manifestFilename) continue;
    // Root-level sidecars are added universally by `collectArchiveFiles`; skip
    // here so deep walks don't duplicate them.
    if (SIDECAR_FILENAMES.has(rel)) continue;
    const body = await readFile(full);
    out.push({ path: rel, body });
  }
}

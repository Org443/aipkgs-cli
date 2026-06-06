import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { TarEntry } from '@local/archive';

// Optional human-facing files that can sit at the root of any package
// regardless of type. Collected once at the top of the pipeline.
export const SIDECAR_FILES = ['README.md', 'LICENSE.txt'] as const;
export const SIDECAR_FILENAMES = new Set<string>(SIDECAR_FILES);

// Pack a single flat package (rule / subagent): just `<slug>.md`.
// Sidecars are handled universally by `collectArchiveFiles`.
export async function collectSingleFlat(args: { root: string; slug: string }): Promise<TarEntry[]> {
  const { root, slug } = args;
  const primary = `${slug}.md`;

  const primaryPath = join(root, primary);
  const primaryStat = await stat(primaryPath).catch(() => null);
  if (!primaryStat?.isFile()) {
    throw new Error(`Missing required file ${primary} in ${root}`);
  }
  return [{ path: primary, body: await readFile(primaryPath) }];
}

export async function collectSidecars(args: { dir: string }): Promise<TarEntry[]> {
  const { dir } = args;
  const out: TarEntry[] = [];
  for (const name of SIDECAR_FILES) {
    const full = join(dir, name);
    const s = await stat(full).catch(() => null);
    if (!s?.isFile()) continue;
    out.push({ path: name, body: await readFile(full) });
  }
  return out;
}

// Box-level scan for flat-key directories (rules/, subagents/): each
// `*.md` file directly under `dir` becomes a TarEntry whose path is just the
// filename. The caller prefixes with the key.
export async function collectFlatFiles(args: { dir: string }): Promise<TarEntry[]> {
  const { dir } = args;
  const items = await readdir(dir, { withFileTypes: true });
  const out: TarEntry[] = [];
  for (const item of items) {
    if (!item.isFile() || !item.name.endsWith('.md')) continue;
    const body = await readFile(join(dir, item.name));
    out.push({ path: item.name, body });
  }
  return out;
}

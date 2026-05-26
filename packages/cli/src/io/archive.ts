import { readFile, readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { MANIFEST_FILENAME, type Manifest, type ManifestType, type TarEntry } from '@local/archive';

// Resolve a path provided on the CLI or in aipkg.json. Bare paths resolve
// against cwd. Returns the absolute path on disk.
export function resolveLocalPath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

// Files always picked up alongside the primary asset, when present in the
// source directory.
const SIDECAR_FILES = ['README.md', 'HERO_CARD.md'] as const;

// Optional human-facing files that can sit at the root of a box archive.
const BOX_SIDECAR_FILES = ['README.md', 'HERO_CARD.md', 'LICENSE.txt'] as const;

// Pick up the optional human-facing files (README, HERO_CARD, LICENSE) that
// live next to a box's `aipkg.json`. The box archive itself has no primary
// content file — these are the only entries packed alongside the manifest.
export async function collectBoxSidecars(args: { dir: string }): Promise<TarEntry[]> {
  const { dir } = args;
  const out: TarEntry[] = [];
  for (const name of BOX_SIDECAR_FILES) {
    const full = join(dir, name);
    const s = await stat(full).catch(() => null);
    if (!s || !s.isFile()) continue;
    out.push({ path: name, body: await readFile(full) });
  }
  return out;
}

// Collect the file entries that should be packed into a publishable archive
// for the manifest sitting in `dir`. `dir` must be a directory and is expected
// to contain `aipkg.json`; `slug` is the manifest's `pkgRef.slug`.
//
// - skill: pack everything under the directory (except `aipkg.json`, which the
//   archive layer adds back from the in-memory manifest).
// - cmd / rule / subagent: pack only `<slug>.md` (required) plus the optional
//   sidecar files (`README.md`, `HERO_CARD.md`) if they exist.
export async function collectFromManifestDir(args: {
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

  if (type === 'skill') return collectDir({ root: dir, manifestFilename });

  return collectFlat({ root: dir, slug });
}

// Collect the files for a single local child of a box, ready to be packed
// into the child's own standalone archive (no prefix — files go at the root
// of the child tarball alongside its synthesized `aipkg.json`).
//
// The src path may be:
//   - a directory (skill, or flat-asset with sidecars)
//   - a `.md` file (flat-asset shortcut)
// The primary filename emitted is `<slug>.md` for flat assets and `SKILL.md`
// for skills.
export async function collectLocalChildFiles(args: {
  type: ManifestType;
  slug: string;
  srcPath: string;
}): Promise<TarEntry[]> {
  const { type, slug, srcPath } = args;

  if (type === 'box') {
    throw new Error(`Cannot nest a box inside another box (entry "${slug}")`);
  }

  const st = await stat(srcPath).catch(() => null);
  if (!st) throw new Error(`Local entry "${slug}" path does not exist: ${srcPath}`);

  if (type === 'skill') {
    if (!st.isDirectory()) throw new Error(`Local skill "${slug}" path must be a directory: ${srcPath}`);
    return collectDir({ root: srcPath });
  }

  const primary = `${slug}.md`;

  if (st.isFile()) {
    if (!srcPath.endsWith('.md')) {
      throw new Error(`Local ${type} "${slug}" must point to a .md file or a directory; got ${srcPath}`);
    }
    return [{ path: primary, body: await readFile(srcPath) }];
  }

  if (!st.isDirectory()) {
    throw new Error(`Local ${type} "${slug}" path is neither a file nor a directory: ${srcPath}`);
  }

  return collectFlat({ root: srcPath, slug });
}

async function collectFlat(args: { root: string; slug: string }): Promise<TarEntry[]> {
  const { root, slug } = args;
  const primary = `${slug}.md`;
  const out: TarEntry[] = [];

  const primaryPath = join(root, primary);
  const primaryStat = await stat(primaryPath).catch(() => null);
  if (!primaryStat || !primaryStat.isFile()) {
    throw new Error(`Missing required file ${primary} in ${root}`);
  }
  out.push({ path: primary, body: await readFile(primaryPath) });

  for (const name of SIDECAR_FILES) {
    const full = join(root, name);
    const s = await stat(full).catch(() => null);
    if (!s || !s.isFile()) continue;
    out.push({ path: name, body: await readFile(full) });
  }

  return out;
}

async function collectDir(args: { root: string; manifestFilename?: string }): Promise<TarEntry[]> {
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
    // The manifest is re-emitted from the in-memory `Manifest` by the archive
    // layer, so skip any on-disk copy (default name or caller-provided custom
    // name) to avoid duplicate entries.
    if (rel === MANIFEST_FILENAME) continue;
    if (manifestFilename && rel === manifestFilename) continue;
    const body = await readFile(full);
    out.push({ path: rel, body });
  }
}

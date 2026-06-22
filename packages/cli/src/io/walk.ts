import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { MANIFEST_FILENAME, type TarEntry, isExecutableMode } from '@local/archive';
import { IGNORE_FILENAME, type Ignore } from './ignore.ts';

// Heavy directories we never descend into, regardless of `.aipkgignore`. This is
// a traversal guard so a stray `node_modules`/`.git` next to a package can't
// blow up collect by reading a huge tree into memory. The archive layer's
// `pruneCruft` remains the authority on which files are cruft; this list only
// mirrors its directory segments to avoid reading what would be discarded.
const ALWAYS_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
]);

// Recursively collect every file under `root` into archive-relative `TarEntry`s,
// honoring `.aipkgignore`. The on-disk manifest (default or caller-provided
// name) and the `.aipkgignore` file itself are skipped: the manifest is
// re-emitted from the in-memory `Manifest` by the archive layer, and the ignore
// file is build metadata, not package content. The result is type-agnostic —
// the archive layer validates and selects per type at pack time.
export async function collectDir(args: {
  root: string;
  ignore: Ignore;
  manifestFilename?: string;
}): Promise<TarEntry[]> {
  const { root, ignore, manifestFilename } = args;
  const out: TarEntry[] = [];
  await walk({ root, dir: root, out, ignore, manifestFilename });
  return out;
}

async function walk(args: {
  root: string;
  dir: string;
  out: TarEntry[];
  ignore: Ignore;
  manifestFilename?: string;
}): Promise<void> {
  const { root, dir, out, ignore, manifestFilename } = args;
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = join(dir, entry.name);
    const rel = relative(root, full).split(/[\\/]/).join('/');

    if (entry.isDirectory()) {
      if (ALWAYS_SKIP_DIRS.has(entry.name)) continue;
      if (ignore.matches({ relPath: rel, isDir: true })) continue;
      await walk({ root, dir: full, out, ignore, manifestFilename });
      continue;
    }

    if (!entry.isFile()) continue;
    if (rel === MANIFEST_FILENAME) continue;
    if (manifestFilename && rel === manifestFilename) continue;
    if (rel === IGNORE_FILENAME) continue;
    if (isSecretEnvFile(entry.name)) continue;
    if (ignore.matches({ relPath: rel, isDir: false })) continue;

    const body = await readFile(full);
    const fileStat = await stat(full);
    const executable = isExecutableMode(fileStat.mode);
    out.push({ path: rel, body, executable });
  }
}

function isSecretEnvFile(name: string): boolean {
  if (name !== '.env' && !name.startsWith('.env.')) return false;
  return !['.example', '.sample', '.template'].some((suffix) => name.endsWith(suffix));
}

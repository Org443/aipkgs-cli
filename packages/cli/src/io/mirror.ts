import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  EXECUTABLE_MODE,
  MANIFEST_FILENAME,
  MANIFEST_TYPE_TO_DEPS_KEY,
  type PackageRef,
  type TarEntry,
  isENOENT,
} from '@local/archive';
import pc from 'picocolors';
import { ConfigFile } from '../files/config.ts';

export const AIPKGS_MIRROR_ROOT = '.aipkgs';

// Mirror an installed archive's full, unzipped contents into the working
// directory's `.aipkgs/` tree, namespaced by deps key + ref — e.g. a
// `rule org443/code-simplify` mirrors to `.aipkgs/rules/org443/code-simplify`.
// Gated behind the `mirror` config flag; gives agents the raw archive (manifest
// included) alongside the assets placed into agent folders. The archive's raw
// tar entries (`archive.files`) are mirrored verbatim. Returns the mirror
// location.
export async function writeAipkgsMirror(args: { pkgRef: PackageRef; files: TarEntry[] }) {
  const { pkgRef, files } = args;

  // If the mirror is disabled, do nothing.
  const state = await ConfigFile.aipkgsMirror();
  if (state !== 'enabled') return;

  const mirror = aipkgsMirrorFor({ pkgRef });

  // Wipe any prior copy first so a reinstall, upgrade, or downgrade can't leave
  // stale files behind from a previous version's layout.
  await rm(mirror, { recursive: true, force: true });

  for (const entry of files) {
    const dest = join(mirror, entry.path);
    await mkdir(dirname(dest), { recursive: true });
    const body = prettyBodyFor(entry);
    await writeFile(dest, body);
    if (entry.executable) await chmod(dest, EXECUTABLE_MODE);
  }

  console.log(pc.dim(`  ${mirror}`));
}

// Remove a package's `.aipkgs/` mirror. Idempotent — a missing mirror is a
// no-op. Always safe to call regardless of the current flag, since the mirror
// may have been written while the flag was on. Reports whether anything was
// removed, plus the mirror location.
export async function removeAipkgsMirror(args: { pkgRef: PackageRef }) {
  const { pkgRef } = args;
  const mirror = aipkgsMirrorFor({ pkgRef });
  try {
    await rm(mirror, { recursive: true });
    return { mirror, removed: true };
  } catch (err) {
    if (isENOENT(err)) return { mirror, removed: false };
    throw err;
  }
}

// The manifest ships as compact JSON inside the archive; pretty-print it in the
// mirror so the on-disk `aipkg.json` is readable. Everything else is copied
// byte-for-byte.
function prettyBodyFor(entry: { path: string; body: Buffer }) {
  if (entry.path !== MANIFEST_FILENAME) return entry.body;
  const manifest = JSON.parse(entry.body.toString('utf8'));
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function aipkgsMirrorFor(args: { pkgRef: PackageRef }) {
  const { pkgRef } = args;
  const depsKey = MANIFEST_TYPE_TO_DEPS_KEY[pkgRef.type];
  return join(process.cwd(), AIPKGS_MIRROR_ROOT, depsKey, pkgRef.manifestRef);
}

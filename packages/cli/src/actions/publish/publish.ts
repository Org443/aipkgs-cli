import { stat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { MANIFEST_FILENAME, type Manifest, archiveService } from '@local/archive';
import pc from 'picocolors';
import { api } from '../../api/index.ts';
import { ConfigFile } from '../../files/config.ts';
import { ManifestFile } from '../../files/manifest.ts';
import { collectArchiveFiles, resolveLocalPath } from '../../io/archive.ts';
import { isENOENT } from '../../io/fs.ts';

// Publish the package described by an `aipkg.json` (or alternate manifest
// file). `path` may point to a directory containing the manifest, or directly
// to the manifest file itself. The manifest's `type` decides what to do:
// `box` is routed to the box-manifest publish flow, every other type packs
// that directory directly.
export async function publishAction(input: { path?: string; dry?: boolean } = {}) {
  const { path, dry } = input;
  const { dir, file } = await resolveManifestLocation(path);

  let manifest: Manifest;
  try {
    manifest = await ManifestFile.read({ dir, file });
  } catch (err) {
    if (isENOENT(err)) throw new Error(`No ${file ?? MANIFEST_FILENAME} in ${dir}`);
    throw err;
  }

  const { type, pkgRef } = manifest;
  const { slug, version } = pkgRef;

  const files = await collectArchiveFiles({ type, dir, slug, manifestFilename: file });
  const { tgz } = await archiveService.pack({ manifest, files });

  if (dry) {
    logManifest({ manifest });
    logArchiveContents({ manifest, files, tgz });
    console.log(pc.yellow('Dry run — skipped upload'), pc.bold(`${type} ${slug}`), pc.dim(version));
    return;
  }

  logArchiveContents({ manifest, files, tgz });

  await api.packages.uploadArchive({ tarball: tgz });

  const appUrl = `${ConfigFile.appBase()}${pkgRef.appPath()}`;

  console.log(pc.green('Published'), pc.bold(`${type} ${slug}`), pc.dim(version));
  console.log(pc.green('App URL:'), pc.bold(appUrl));
}

function logManifest(args: { manifest: Manifest }) {
  const { manifest } = args;
  console.log(pc.bold('Manifest'));
  console.log(JSON.stringify(manifest.toObject(), null, 2));
}

function logArchiveContents(args: {
  manifest: Manifest;
  files: { path: string; body: Buffer }[];
  tgz: Buffer;
}) {
  const { manifest, files, tgz } = args;
  const manifestBytes = Buffer.byteLength(JSON.stringify(manifest.toObject()));

  console.log(pc.bold('Archive contents'), pc.dim(`(${files.length + 1} files, ${formatBytes(tgz.length)} packed)`));
  console.log(`  ${MANIFEST_FILENAME} ${pc.dim(`(${formatBytes(manifestBytes)})`)}`);
  for (const f of files) {
    console.log(`  ${f.path} ${pc.dim(`(${formatBytes(f.body.length)})`)}`);
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// `path` may be a directory (use the default manifest filename inside it) or
// a manifest file (its parent becomes `dir`, its basename becomes `file`).
async function resolveManifestLocation(path?: string): Promise<{ dir: string; file?: string }> {
  const resolved = resolveLocalPath(path ?? process.cwd());

  const st = await stat(resolved).catch(() => null);
  if (!st) throw new Error(`Path does not exist: ${resolved}`);

  if (st.isDirectory()) return { dir: resolved };
  if (st.isFile()) return { dir: dirname(resolved), file: basename(resolved) };

  throw new Error(`Path is neither a file nor a directory: ${resolved}`);
}

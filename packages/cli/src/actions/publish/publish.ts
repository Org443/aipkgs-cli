import { stat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { MANIFEST_FILENAME, type Manifest, archiveService } from '@local/archive';
import pc from 'picocolors';
import { api } from '../../api/index.ts';
import { confirm } from '../../autocomplete/confirm.ts';
import { ConfigFile } from '../../files/config.ts';
import { ManifestFile } from '../../files/manifest.ts';
import { collectArchiveFiles, resolveLocalPath } from '../../io/collect-files.ts';
import { isENOENT } from '../../io/fs.ts';

// Publish the package described by an `aipkg.json` (or alternate manifest
// file). `path` may point to a directory containing the manifest, or directly
// to the manifest file itself. The manifest's `type` decides what to do:
// `box` is routed to the box-manifest publish flow, every other type packs
// that directory directly.
export async function publishAction(
  input: { path?: string; dry?: boolean; yes?: boolean; major?: boolean; minor?: boolean; patch?: boolean } = {},
) {
  const { path, dry, yes } = input;
  const { dir, file } = await resolveManifestLocation(path);

  let manifest: ManifestFile;
  try {
    manifest = await ManifestFile.read({ dir, file });
  } catch (err) {
    if (isENOENT(err)) throw new Error(`No ${file ?? MANIFEST_FILENAME} in ${dir}`);
    throw err;
  }

  const bump = bumpVersion(input);
  let previousVersion: string | undefined;
  if (bump) {
    previousVersion = manifest.version;
    manifest.bumpVersion(bump);
  }

  const { type, pkgRef } = manifest;
  const { slug, version } = pkgRef;

  const files = await collectArchiveFiles({ dir, manifestFilename: file });
  const { tgz } = await archiveService.pack({ manifest, files });

  if (dry) {
    logManifest({ manifest });
    logArchiveContents({ manifest, files, tgz });
    if (bump) {
      console.log(pc.yellow(`Dry run — would bump ${bump}`), pc.dim(`${previousVersion} → ${version}`));
    }
    console.log(pc.yellow('Dry run — skipped upload'), pc.bold(`${type} ${slug}`), pc.dim(version));
    return;
  }

  // Interactive confirmation: show the manifest and the files that will be
  // packed, then ask before uploading. Skipped with `--yes`, and in a non-TTY
  // (CI, pipes) where there's nothing to drive the prompt — there we just print
  // the archive contents and publish, preserving the non-interactive behavior.
  if (!yes && process.stdout.isTTY) {
    logManifest({ manifest });
    logArchiveContents({ manifest, files, tgz });
    const confirmed = await confirm({ message: `Publish ${type} ${slug} ${version}?` });
    if (!confirmed) {
      console.log(pc.dim('Cancelled.'));
      return;
    }
  } else {
    logArchiveContents({ manifest, files, tgz });
  }

  await api.packages.uploadArchive({ tarball: tgz });

  if (bump) {
    await manifest.write();
    console.log(pc.green(`Bumped ${bump}`), pc.dim(`${previousVersion} → ${version}`), pc.dim(MANIFEST_FILENAME));
  }

  const appUrl = `${ConfigFile.appBase()}${pkgRef.appPath()}`;

  console.log(pc.green('Published'), pc.bold(`${type} ${slug}`), pc.dim(version));
  console.log(pc.green('App URL:'), pc.bold(appUrl));
}

// Resolve which version bump (if any) the publish flags request. Exactly one of
// `--major`/`--minor`/`--patch` may be active — more than one is ambiguous.
function bumpVersion(input: { major?: boolean; minor?: boolean; patch?: boolean }) {
  const active = (['major', 'minor', 'patch'] as const).filter((r) => input[r]);
  if (active.length === 0) return undefined;
  if (active.length > 1) {
    const flags = active.map((r) => `--${r}`).join(', ');
    throw new Error(`Pass only one of --major, --minor, --patch (got ${flags})`);
  }
  return active[0];
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

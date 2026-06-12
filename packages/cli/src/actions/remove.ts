import { type Manifest, PackageRef } from '@local/archive';
import { AssetPlacement } from '@local/placement';
import pc from 'picocolors';
import { ConfigFile } from '../files/config.ts';
import { Lockfile } from '../files/lockfile.ts';
import { ManifestFile } from '../files/manifest.ts';
import { removeAipkgsMirror } from '../io/mirror.ts';

export async function removeAction(input: { type: Manifest['type']; ref: string }) {
  const { type, ref } = input;
  const pkgRef = new PackageRef({ refStr: `${type}/${ref}` });
  const slug = pkgRef.entryKey();

  const targets = await ConfigFile.resolvedTargets();
  const manifest = await ManifestFile.resolve();
  const lockfile = await Lockfile.resolve();

  const rootLock = lockfile.getEntry({ pkgRef });

  const { entries } = lockfile.collectSubtree({ rootRef: rootLock?.aipkgRef });

  const removedPaths: string[] = [];
  let clearedStatusLine = false;
  let removedFromLock = false;

  // The root entry and its locked subtree get the same treatment: placed files,
  // statusLine claim (a setup or box may own the single tracked one), lock entry.
  for (const entry of [{ type, slug }, ...entries]) {
    const { paths } = await AssetPlacement.remove({ type: entry.type, refStr: entry.slug, targets });
    removedPaths.push(...paths);
    if (lockfile.removeStatusLine({ slug: entry.slug })) clearedStatusLine = true;
    if (lockfile.removeEntry({ type: entry.type, slug: entry.slug })) removedFromLock = true;
  }

  const removedFromManifest = manifest.removeEntry({ type, key: slug });

  const { mirror, removed: removedMirror } = await removeAipkgsMirror({ pkgRef });
  if (removedMirror) removedPaths.push(mirror);

  if (!removedFromManifest && !removedFromLock && !clearedStatusLine && entries.length === 0) {
    console.log(pc.yellow(`Nothing to remove — no ${type} "${slug}" tracked in aipkg.json`));
    return;
  }

  await manifest.write();
  await lockfile.write();

  console.log(`${pc.green('Removed')} ${pc.bold(`${type} ${slug}`)}`);
  for (const path of removedPaths) console.log(pc.dim(`  ${path}`));
  if (removedFromManifest) console.log(pc.dim('  aipkg.json'));
  if (removedFromLock) console.log(pc.dim('  aipkg.lock'));
}

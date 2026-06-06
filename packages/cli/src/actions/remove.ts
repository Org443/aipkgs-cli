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

  // Remove the top level
  const { paths: removed } = await AssetPlacement.remove({ type, refStr: slug, targets });
  removedPaths.push(...removed);

  for (const child of entries) {
    const { paths: removed } = await AssetPlacement.remove({ type: child.type, refStr: child.slug, targets });
    removedPaths.push(...removed);
    if (lockfile.removeStatusLine({ slug: child.slug })) clearedStatusLine = true;
    await lockfile.removeEntry({ type: child.type, slug: child.slug });
  }

  // A setup or box may own the single tracked statusLine — drop it when its owner goes.
  if (lockfile.removeStatusLine({ slug })) clearedStatusLine = true;

  const [removedFromManifest, removedFromLock] = await Promise.all([
    manifest.removeEntry({ type, key: slug }),
    lockfile.removeEntry({ type, slug }),
  ]);

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

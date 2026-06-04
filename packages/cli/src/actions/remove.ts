import { type Manifest, PackageRef } from '@local/archive';
import { place } from '@local/placement';
import pc from 'picocolors';
import { ConfigFile } from '../files/config.ts';
import { Lockfile } from '../files/lockfile.ts';
import { ManifestFile } from '../files/manifest.ts';
import { removeAipkgsMirror } from '../io/aipkgs.ts';

export async function removeAction(input: { type: Manifest['type']; ref: string }) {
  const { type, ref } = input;
  const pkgRef = new PackageRef({ refStr: `${type}/${ref}` });
  const slug = pkgRef.entryKey();

  const targets = await ConfigFile.resolvedTargets();
  const manifest = await ManifestFile.resolve();
  const lockfile = await Lockfile.resolve();

  const rootLock = lockfile.getEntry({ pkgRef });

  const { entries, mcps } = lockfile.collectSubtree({ rootRef: rootLock?.aipkgRef });

  const removedPaths: string[] = [];
  let clearedStatusLine = false;

  // Boxes have no placeable path of their own; everything else writes one file/dir.
  if (type !== 'box') {
    const { paths } = await place.remove({ type, slug, targets });
    removedPaths.push(...paths);
  }

  const { mirror, removed: removedMirror } = await removeAipkgsMirror({ pkgRef });
  if (removedMirror) removedPaths.push(mirror);

  for (const child of entries) {
    const { paths } = await place.remove({ type: child.type, slug: child.slug, targets });
    removedPaths.push(...paths);
    if (lockfile.removeStatusLine({ slug: child.slug })) clearedStatusLine = true;
    await lockfile.removeEntry({ type: child.type, slug: child.slug });
  }

  for (const name of mcps) {
    await place.removeMcp({ slug: name, targets });
    lockfile.removeMcp({ slug: name });
    manifest.removeMcp({ slug: name });
  }

  if (lockfile.removeStatusLine({ slug })) clearedStatusLine = true;
  if (clearedStatusLine) await place.clearStatusLine({ targets });

  const { removed: removedFromManifest } = await manifest.removeEntry({ type, key: slug });
  const removedFromLock = await lockfile.removeEntry({ type, slug });

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

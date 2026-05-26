import type { Manifest } from '@local/archive';
import { place } from '@local/placement';
import pc from 'picocolors';
import { SEGMENT } from '../constants.ts';
import { ConfigFile } from '../files/config.ts';
import { Lockfile } from '../files/lockfile.ts';
import { ManifestFile } from '../files/manifest.ts';

export async function removeAction(input: { type: Manifest['type']; slugOrRef: string }) {
  const { type, slugOrRef } = input;
  const slug = slugOrRef.includes('/') ? (slugOrRef.split('/').filter(Boolean).pop() ?? '') : slugOrRef;

  if (!SEGMENT.test(slug)) {
    throw new Error(`Invalid name "${slug}" — Good: "aipkg cmd remove pr-create" or "aipkg cmd remove acme/pr-create"`);
  }

  const target = await ConfigFile.resolvedTarget();
  const manifest = await ManifestFile.resolve();
  const lockfile = await Lockfile.resolve();

  const { path: installed } = await place.remove({ type, slug, target });
  const { removed: removedFromManifest, pkgRef } = await manifest.removeEntry({ type, slug });
  const removedFromLock = pkgRef ? await lockfile.removeEntry({ type, slug }) : false;

  if (!removedFromManifest && !removedFromLock) {
    console.log(pc.yellow(`Nothing to remove — no ${type} "${slug}" tracked in aipkg.json`));
    return;
  }

  await manifest.write();
  await lockfile.write();

  console.log(`${pc.green('Removed')} ${pc.bold(`${type} ${slug}`)}`);
  console.log(pc.dim(`  ${installed}`));
  if (removedFromManifest) console.log(pc.dim('  aipkg.json'));
  if (removedFromLock) console.log(pc.dim('  aipkg.lock'));
}

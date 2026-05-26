import { type Manifest, PackageRef } from '@local/archive';
import pc from 'picocolors';
import { SEGMENT } from '../../constants.ts';
import { ConfigFile } from '../../files/config.ts';
import { Lockfile } from '../../files/lockfile.ts';
import { ManifestFile } from '../../files/manifest.ts';
import { installPkg } from './pkg.ts';

export async function installAction(args: { type: Manifest['type']; ref: string; alias?: string | undefined }) {
  const { type, ref: refStr, alias } = args;

  const pkgRef = new PackageRef({ refStr: `${type}/${refStr}` });

  if (alias !== undefined && !SEGMENT.test(alias)) {
    throw new Error(`Invalid alias "${alias}" — use letters, digits, and hyphens only`);
  }

  const target = await ConfigFile.resolvedTarget();
  const lockfile = await Lockfile.resolve();
  const manifest = await ManifestFile.resolve();

  // writes assets to active folders to be used by the AI, updating the lockfile
  const { archive } = await installPkg({ pkgRef, alias, lockfile, target });

  await manifest.upsertEntry({ slug: alias ?? pkgRef.slug, pkgRef });

  const label = alias ?? pkgRef.slug;

  await manifest.write();
  await lockfile.write();

  console.log(`${pc.green('Installed')} ${pc.bold(`${pkgRef.type} ${label}`)} ${pc.dim(`v${archive.version}`)}`);
  console.log(`${pc.dim(type)} ${pc.cyan(pkgRef.aipkgRef)}`);
}

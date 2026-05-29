import { type Manifest, PackageRef } from '@local/archive';
import pc from 'picocolors';
import { ConfigFile } from '../../files/config.ts';
import { Lockfile } from '../../files/lockfile.ts';
import { ManifestFile } from '../../files/manifest.ts';
import { installPkg } from './pkg.ts';

export async function installAction(args: { type: Manifest['type']; ref: string }) {
  const { type, ref: refStr } = args;

  const pkgRef = new PackageRef({ refStr: `${type}/${refStr}` });

  const target = await ConfigFile.resolvedTarget();
  const lockfile = await Lockfile.resolve();
  const manifest = await ManifestFile.resolve();

  // writes assets to active folders to be used by the AI, updating the lockfile
  const { archive } = await installPkg({ pkgRef, lockfile, target });

  const upserted = await manifest.upsertEntry({ pkgRef });

  await manifest.write();
  await lockfile.write();

  console.log(
    `${pc.green('Installed')} ${pc.bold(`${pkgRef.type} ${upserted.slug}`)} ${pc.dim(`v${archive.version}`)}`,
  );
  console.log(`${pc.dim(type)} ${pc.cyan(pkgRef.aipkgRef)}`);
}

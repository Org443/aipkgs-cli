import { type Manifest, PackageRef } from '@local/archive';
import pc from 'picocolors';
import { ConfigFile } from '../../files/config.ts';
import { Lockfile } from '../../files/lockfile.ts';
import { ManifestFile } from '../../files/manifest.ts';
import { hydratePkg } from './hydrate-pkg.ts';

export async function installAction(args: { type: Manifest['type']; ref: string }) {
  const { type, ref: refStr } = args;

  const pkgRef = new PackageRef({ refStr: `${type}/${refStr}` });

  const targets = await ConfigFile.resolvedTargets();
  const lockfile = await Lockfile.resolve();
  const manifest = await ManifestFile.resolve();

  // writes assets to active folders to be used by the AI, updating the lockfile
  await hydratePkg({ pkgRef, lockfile, targets });

  const upserted = manifest.upsertEntry({ pkgRef });

  await manifest.write();
  await lockfile.write();

  console.log(`${pc.green('Installed')} ${pc.bold(`${pkgRef.type} ${upserted.slug}`)} ${pc.dim(`v${pkgRef.version}`)}`);
  console.log(`${pc.dim(type)} ${pc.cyan(pkgRef.aipkgRef)}`);
}

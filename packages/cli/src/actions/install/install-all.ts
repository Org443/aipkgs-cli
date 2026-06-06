import { DEPS_KEYS, MANIFEST_FILENAME, type Manifest, type PackageRef } from '@local/archive';
import pc from 'picocolors';
import { ConfigFile } from '../../files/config.ts';
import { Lockfile, lockfilePathFor } from '../../files/lockfile.ts';
import { ManifestFile } from '../../files/manifest.ts';
import { installPkg } from './pkg.ts';

export async function installAllAction(args: { manifest?: string } = {}) {
  const targets = await ConfigFile.resolvedTargets();
  const manifest = await ManifestFile.resolve({ file: args.manifest });
  const lockfile = await Lockfile.resolve({ file: lockfilePathFor(manifest.path) });

  const { tasks } = collectTasks({ manifest, lockfile });

  if (tasks.length === 0) {
    console.log(pc.dim(`Nothing to install — ${MANIFEST_FILENAME} has no deps`));
    return;
  }

  for (const pkgRef of tasks) {
    const { archive } = await installPkg({ pkgRef, lockfile, targets });

    await lockfile.upsertEntry({ archive, ...pkgRef });
  }

  await manifest.write();
  await lockfile.write();

  console.log(pc.green(`Installed ${tasks.length} package${tasks.length === 1 ? '' : 's'}.`));
}

function collectTasks(args: { manifest: Manifest; lockfile: Lockfile }) {
  const { manifest, lockfile } = args;
  const tasks: PackageRef[] = [];

  for (const key of DEPS_KEYS) {
    const assetBucket = manifest.deps[key];
    if (!assetBucket) continue;

    for (const entry of Object.values(assetBucket)) {
      const pkgRef = lockfile.resolvePkgRef({ pkgRef: entry });
      tasks.push(pkgRef);
    }
  }

  return { tasks };
}

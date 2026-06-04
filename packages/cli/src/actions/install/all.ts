import { DEPS_KEYS, MANIFEST_FILENAME, type Manifest, type McpEntry, type PackageRef } from '@local/archive';
import { place } from '@local/placement';
import pc from 'picocolors';
import { ConfigFile } from '../../files/config.ts';
import { Lockfile, lockfilePathFor } from '../../files/lockfile.ts';
import { ManifestFile } from '../../files/manifest.ts';
import { installPkg } from './pkg.ts';

export async function installAllAction(args: { manifest?: string } = {}) {
  const targets = await ConfigFile.resolvedTargets();
  const manifest = await ManifestFile.resolve({ file: args.manifest });
  const lockfile = await Lockfile.resolve({ file: lockfilePathFor(manifest.path) });

  const { tasks, mcps } = collectTasks({ manifest, lockfile });

  if (tasks.length === 0 && mcps.length === 0) {
    console.log(pc.dim(`Nothing to install — ${MANIFEST_FILENAME} has no deps`));
    return;
  }

  for (const pkgRef of tasks) {
    const { archive } = await installPkg({ pkgRef, lockfile, targets });

    await lockfile.upsertEntry({ pkgRef, archive });
  }

  for (const { name, entry } of mcps) {
    lockfile.upsertMcp({ slug: name, entry });
    await place.installMcp({ slug: name, entry, targets });
  }

  await manifest.write();
  await lockfile.write();

  const parts: string[] = [];
  if (tasks.length > 0) parts.push(`${tasks.length} package${tasks.length === 1 ? '' : 's'}`);
  if (mcps.length > 0) parts.push(`${mcps.length} mcp${mcps.length === 1 ? '' : 's'}`);
  console.log(pc.green(`Installed ${parts.join(' + ')}.`));
}

function collectTasks(args: { manifest: Manifest; lockfile: Lockfile }) {
  const { manifest, lockfile } = args;
  const tasks: PackageRef[] = [];
  const mcps: { name: string; entry: McpEntry }[] = [];

  for (const key of DEPS_KEYS) {
    const assetBucket = manifest.deps[key];
    if (!assetBucket) continue;

    for (const entry of Object.values(assetBucket)) {
      const pkgRef = lockfile.resolvePkgRef({ pkgRef: entry });
      tasks.push(pkgRef);
    }
  }

  for (const [name, entry] of Object.entries(manifest.deps.mcps ?? {})) {
    mcps.push({ name, entry });
  }

  return { tasks, mcps };
}

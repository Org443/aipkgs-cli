/**
 * When we install a package, we also need to install its dependencies recursively.
 * This means pulling in the dependencies of the dependencies, and so on.
 *
 * We will add the resolved dependencies to the lockfile.
 * If we find an existing entry in the lockfile with same type and slug, we will throw a ConflictError.
 */

import { type AIpkgArchive, type AgentTarget, DEPS_KEYS } from '@local/archive';
import type { Lockfile } from '../../files/lockfile.ts';
import { installPkg } from './pkg.ts';

export async function resolveDeps(args: { archive: AIpkgArchive; lockfile: Lockfile; targets: AgentTarget[] }) {
  const { archive, lockfile, targets } = args;

  const { manifest } = archive;
  const { deps } = manifest;
  const parent = archive.pkgRef.aipkgRef;

  for (const depsKey of DEPS_KEYS) {
    const depsBucket = deps[depsKey];
    if (!depsBucket) continue;
    for (const entry of Object.values(depsBucket)) {
      const pkgRef = lockfile.resolvePkgRef({ pkgRef: entry });
      await installPkg({ pkgRef, lockfile, targets, parent });
    }
  }
}

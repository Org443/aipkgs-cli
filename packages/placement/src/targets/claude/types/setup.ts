import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ArchiveSetup, PackageRef } from '@local/archive';

/**
 * A setup bundle's script payload is stored under
 * `.claude/scripts/<org>/<key?>/<slug>`, namespaced by the package ref so bundles
 * from different packages never collide. These are the assets the hook commands
 * reference; the event map, status line, and MCP servers carried by the bundle
 * are applied to the agent's config separately (by the agent), not placed here.
 */
export async function installSetup(args: { setup: ArchiveSetup; pkgRef: PackageRef }) {
  const { setup, pkgRef } = args;
  const written: string[] = [];

  const dir = join(process.cwd(), '.claude', 'scripts', pkgRef.manifestRef);
  await mkdir(dir, { recursive: true });

  for (const script of setup.scripts) {
    const dest = join(dir, script.path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, script.body);
    written.push(dest);
  }

  return { written };
}

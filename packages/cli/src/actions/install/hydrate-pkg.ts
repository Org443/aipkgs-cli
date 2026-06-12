import { type AgentTarget, type PackageRef, archiveService } from '@local/archive';
import { AssetPlacement } from '@local/placement';
import pc from 'picocolors';
import { api } from '../../api/index.ts';
import type { Lockfile } from '../../files/lockfile.ts';
import { writeAipkgsMirror } from '../../io/mirror.ts';
import { resolveDeps } from './deps-resolution.ts';

export async function hydratePkg(args: {
  pkgRef: PackageRef;
  lockfile: Lockfile;
  targets: AgentTarget[];
  parent?: string;
}) {
  const { pkgRef, parent, lockfile, targets } = args;
  const slug = pkgRef.entryKey();

  const lock = lockfile.getEntry({ pkgRef });

  // A lock entry pinned to a different version means this is an upgrade/
  // downgrade — drop the stale pin so the SHA guard below and the later
  // upsertEntry don't reject the new archive.
  if (lock && lock.version !== pkgRef.version) {
    lockfile.removeEntry({ type: pkgRef.type, slug });
  }

  const tarball = await api.packages.downloadArchive({ pkgRef });
  const archive = await archiveService.parse(tarball);

  // The SHA guard only defends against a tampered archive for the *same*
  // pinned version; a version change is handled by clearing the pin above.
  if (lock && lock.version === pkgRef.version && lock.sha !== archive.sha) {
    throw new Error(
      `SHA mismatch for ${pkgRef.aipkgRef}: lockfile expects ${lock.sha}, but the downloaded archive hashes to ${archive.sha}`,
    );
  }

  await writeAipkgsMirror({ pkgRef, files: archive.files });

  // A setup bundle may carry the single allowed statusLine. Claim it in the
  // lockfile before placement so a conflicting second claim fails fast — before
  // any agent config is written to disk.
  const { statusLine } = archive.setup ?? {};
  if (statusLine) lockfile.upsertStatusLine({ slug, statusLine, parent });

  // Place the asset into every selected agent's folder layout.
  const written = await AssetPlacement.install({ archive, targets });

  // A box can legitimately place nothing of its own and exist purely to pull in
  // a set of declared deps; those are resolved below in `resolveDeps`. Only an
  // archive that places nothing *and* declares no deps is genuinely empty.
  if (written.paths.length === 0 && !archive.manifest.hasDeps()) {
    throw new Error(`Archive for ${pkgRef.aipkgRef} contained nothing installable`);
  }

  for (const file of written.paths) console.log(pc.dim(`  ${file}`));

  // `written.deps` are the box's own bundled children (rules/subagents/skills
  // physically packed inside the box archive). Their parent is the box itself —
  // not this install's `parent` — so a later `remove box` can walk the subtree
  // and reverse them. (Non-box archives carry no `written.deps`.)
  for (const dep of written.deps) {
    lockfile.upsertEntry({ archive, ...dep, parent: archive.pkgRef.aipkgRef });
  }

  // Setups and boxes are keyed by their full ref, not the bare slug — use
  // entryKey() (already computed as `slug`) so the lockfile, manifest, and disk
  // all agree on the key.
  lockfile.upsertEntry({ archive, type: pkgRef.type, slug, parent });

  await resolveDeps({ archive, lockfile, targets });

  return { archive, pkgRef };
}

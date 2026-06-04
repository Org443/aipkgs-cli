import {
  type AIpkgArchive,
  type AgentTarget,
  MANIFEST_FILENAME,
  type Manifest,
  type PackageRef,
  type TarEntry,
  archiveService,
} from '@local/archive';
import { place } from '@local/placement';
import pc from 'picocolors';
import { api } from '../../api/index.ts';
import type { Lockfile } from '../../files/lockfile.ts';
import { writeAipkgsMirror } from '../../io/aipkgs.ts';
import { resolveDeps } from './deps-resolution.ts';

export async function installPkg(args: {
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
    await lockfile.removeEntry({ type: pkgRef.type, slug });
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

  await writeAipkgsMirror({ archive });

  if (pkgRef.type === 'box') {
    return installBox({ archive, lockfile, targets, parent });
  }

  // Place the asset into every selected agent's folder layout.
  const { written, statusLine } = await place.install({ archive, slug, targets });
  for (const file of written) console.log(pc.dim(`  ${file}`));

  if (written.length === 0) {
    throw new Error(`Archive for ${pkgRef.aipkgRef} contained nothing installable`);
  }

  if (statusLine) {
    lockfile.upsertStatusLine({ slug, statusLine, parent });
    const { paths } = await place.setStatusLine({ slug, statusLine, targets });
    for (const path of paths) console.log(pc.dim(`  ${path}`));
  }

  await lockfile.upsertEntry({ pkgRef, archive, parent });

  await resolveDeps({ archive, lockfile, targets });

  return { archive, pkgRef };
}

async function installBox(args: {
  archive: AIpkgArchive;
  lockfile: Lockfile;
  targets: AgentTarget[];
  parent?: string;
}) {
  const { archive, lockfile, targets, parent } = args;
  const { pkgRef } = archive;

  await lockfile.upsertEntry({ pkgRef, archive, parent });

  const children = parseBoxChildren({ files: archive.files, boxRef: pkgRef.manifestRef });
  for (const child of children) {
    const { written, statusLine } = await place.installFiles({
      type: child.type,
      slug: child.slug,
      files: child.files,
      targets,
    });
    for (const file of written) console.log(pc.dim(`  ${file}`));
    if (statusLine) {
      lockfile.upsertStatusLine({ slug: child.slug, statusLine, parent: pkgRef.aipkgRef });
      const { paths } = await place.setStatusLine({ slug: child.slug, statusLine, targets });
      for (const path of paths) console.log(pc.dim(`  ${path}`));
    }
    await lockfile.upsertBoxChild({ archive, type: child.type, slug: child.slug });
  }

  await resolveDeps({ archive, lockfile, targets });

  return { archive, pkgRef };
}

function parseBoxChildren(args: { files: TarEntry[]; boxRef: string }): Array<{
  type: Manifest['type'];
  slug: string;
  files: TarEntry[];
}> {
  const { files, boxRef } = args;
  const groups = new Map<string, { type: Manifest['type']; slug: string; files: TarEntry[] }>();

  for (const file of files) {
    if (file.path === MANIFEST_FILENAME) continue;
    const parsed = parseChildPath({ path: file.path, boxRef });
    if (!parsed) continue;

    const { type, slug, rel } = parsed;
    const key = `${type}:${slug}`;
    const group = groups.get(key) ?? { type, slug, files: [] };
    group.files.push({ path: rel, body: file.body });
    groups.set(key, group);
  }

  return Array.from(groups.values());
}

function parseChildPath(args: {
  path: string;
  boxRef: string;
}): { type: Manifest['type']; slug: string; rel: string } | null {
  const { path, boxRef } = args;
  const [top, ...rest] = path.split('/');
  if (!top || rest.length === 0) return null;

  if (top === 'skills') {
    const [slug, ...sub] = rest;
    if (!slug || sub.length === 0) return null;
    return { type: 'skill', slug, rel: sub.join('/') };
  }

  // Box hooks are a flat bundle under `hooks/`, owned by the box's ref —
  // the entire `hooks/` subtree becomes one hook child keyed off the box.
  if (top === 'hooks') {
    return { type: 'hook', slug: boxRef, rel: rest.join('/') };
  }

  if (rest.length !== 1) return null;
  const name = rest[0];
  if (!name?.endsWith('.md')) return null;
  const slug = name.slice(0, -'.md'.length);

  switch (top) {
    case 'cmds':
      return { type: 'cmd', slug, rel: name };
    case 'subagents':
      return { type: 'subagent', slug, rel: name };
    case 'rules':
      return { type: 'rule', slug, rel: name };
    default:
      return null;
  }
}

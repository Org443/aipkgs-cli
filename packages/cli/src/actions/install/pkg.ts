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
import { resolveDeps } from './deps-resolution.ts';

export async function installPkg(args: {
  pkgRef: PackageRef;
  alias?: string;
  lockfile: Lockfile;
  target: AgentTarget;
  parent?: string;
}) {
  const { pkgRef, alias, parent, lockfile, target } = args;
  const slug = alias ?? pkgRef.slug;

  const lock = lockfile.getEntry({ type: pkgRef.type, slug });

  const tarball = await api.packages.downloadArchive({ pkgRef });
  const archive = await archiveService.parse(tarball);

  if (lock && lock.sha !== archive.sha) {
    throw new Error(
      `SHA mismatch for ${pkgRef.aipkgRef}: lockfile expects ${lock.sha}, but the downloaded archive hashes to ${archive.sha}`,
    );
  }

  if (pkgRef.type === 'box') {
    return installBox({ archive, lockfile, target, parent });
  }

  const { written } = await place.install({ archive, slug, target });

  if (written.length === 0) {
    throw new Error(`Archive for ${pkgRef.aipkgRef} contained nothing installable`);
  }
  for (const file of written) console.log(pc.dim(`  ${file}`));

  await lockfile.upsertEntry({ pkgRef, archive, slug, parent });

  await resolveDeps({ archive, lockfile, target });

  return { archive, pkgRef };
}

async function installBox(args: {
  archive: AIpkgArchive;
  lockfile: Lockfile;
  target: AgentTarget;
  parent?: string;
}) {
  const { archive, lockfile, target, parent } = args;
  const { pkgRef } = archive;

  await lockfile.upsertEntry({ pkgRef, archive, parent });

  const children = parseBoxChildren({ files: archive.files });
  for (const child of children) {
    const { written } = await place.installFiles({
      type: child.type,
      slug: child.slug,
      files: child.files,
      target,
    });
    for (const file of written) console.log(pc.dim(`  ${file}`));
    await lockfile.upsertBoxChild({ archive, type: child.type, slug: child.slug });
  }

  await resolveDeps({ archive, lockfile, target });

  return { archive, pkgRef };
}

function parseBoxChildren(args: { files: TarEntry[] }): Array<{
  type: Manifest['type'];
  slug: string;
  files: TarEntry[];
}> {
  const groups = new Map<string, { type: Manifest['type']; slug: string; files: TarEntry[] }>();

  for (const file of args.files) {
    if (file.path === MANIFEST_FILENAME) continue;
    const parsed = parseChildPath(file.path);
    if (!parsed) continue;

    const { type, slug, rel } = parsed;
    const key = `${type}:${slug}`;
    const group = groups.get(key) ?? { type, slug, files: [] };
    group.files.push({ path: rel, body: file.body });
    groups.set(key, group);
  }

  return Array.from(groups.values());
}

function parseChildPath(path: string): { type: Manifest['type']; slug: string; rel: string } | null {
  const [top, ...rest] = path.split('/');
  if (!top || rest.length === 0) return null;

  if (top === 'skills') {
    const [slug, ...sub] = rest;
    if (!slug || sub.length === 0) return null;
    return { type: 'skill', slug, rel: sub.join('/') };
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

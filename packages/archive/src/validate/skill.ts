import { InvalidArchive } from '../errors.ts';
import type { Manifest } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';
import { pruneCruft } from './prune.ts';
import { assertRequiredFile, isPayloadFile } from './shared.ts';

const SKILL_ENTRY = 'SKILL.md';

// A skill decoded into the universal archive shape: its slug, the `SKILL.md`
// body, and every other payload file (re-rooted to the skill's own layout).
export type ArchiveSkill = { slug: string; skillMd: Buffer; assets: TarEntry[] };

export function assertSkillArchive(args: { manifest: Manifest; files: TarEntry[] }): ArchiveSkill {
  const { manifest, files } = args;
  return parseSkill({ slug: manifest.pkgRef.slug, files });
}

// Validate a flat skill layout (`SKILL.md` plus arbitrary nested payload) and
// return its decoded form. Reused by the box validator, which passes each child
// skill's re-rooted files and its slug.
export function parseSkill(args: { slug: string; files: TarEntry[] }): ArchiveSkill {
  const { slug, files } = args;

  const pruned = pruneCruft(files);

  assertRequiredFile({ files: pruned, path: SKILL_ENTRY, archiveType: 'skill' });

  const skillMd = pruned.find((f) => f.path === SKILL_ENTRY);
  if (!skillMd) throw new InvalidArchive({ message: `skill archive missing required file: ${SKILL_ENTRY}` });

  // Assets are the skill's own payload — everything except SKILL.md, the manifest,
  // and the metadata sidecars.
  const assets = pruned.filter((f) => f.path !== SKILL_ENTRY && isPayloadFile(f.path));

  return { slug, skillMd: skillMd.body, assets };
}

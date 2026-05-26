import type { Manifest } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';
import { pruneCruft } from './prune.ts';
import { assertRequiredFile } from './shared.ts';

const SKILL_ENTRY = 'SKILL.md';

export function assertSkillArchive(args: {
  manifest: Manifest;
  files: TarEntry[];
}): { files: TarEntry[] } {
  const { files } = args;

  const pruned = pruneCruft(files);

  assertRequiredFile({ files: pruned, path: SKILL_ENTRY, archiveType: 'skill' });

  return { files: pruned };
}

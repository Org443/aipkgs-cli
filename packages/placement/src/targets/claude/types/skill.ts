import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ArchiveSkill } from '@local/archive';

const SKILL_ENTRY = 'SKILL.md';

/**
 * Claude skills are stored in the `.claude/skills/<slug>` directory: the
 * `SKILL.md` body plus every payload asset, with the asset tree preserved.
 */
export async function installSkill(args: { skill: ArchiveSkill }) {
  const { skill } = args;
  const { slug, skillMd, assets } = skill;
  const written: string[] = [];

  const dir = join(process.cwd(), '.claude', 'skills', slug);
  await mkdir(dir, { recursive: true });

  const skillDest = join(dir, SKILL_ENTRY);
  await writeFile(skillDest, skillMd);
  written.push(skillDest);

  for (const asset of assets) {
    const dest = join(dir, asset.path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, asset.body);
    written.push(dest);
  }

  return { written };
}

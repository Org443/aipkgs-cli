import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ArchiveSkill } from '@local/archive';

/**
 * Skills are the one asset the open standard actually defines: a `SKILL.md`-rooted
 * folder under `.agents/skills/<slug>`, payload assets alongside at their original
 * depth, placed verbatim.
 */
export async function installSkill(args: { skill: ArchiveSkill }) {
  const { skill } = args;
  const { slug, skillMd, assets } = skill;
  const written: string[] = [];

  const cwd = process.cwd();
  const dir = join(cwd, '.agents', 'skills', slug);
  await mkdir(dir, { recursive: true });

  const skillDest = join(dir, 'SKILL.md');
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

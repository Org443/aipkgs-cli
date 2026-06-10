import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ArchiveSkill } from '@local/archive';

const SKILL_ENTRY = 'SKILL.md';

/**
 * Codex adopted the open agent-skills standard and discovers skills under
 * `.agents/skills/<slug>` — not `.codex/skills/` (the original experimental path)
 * and not Claude's `.claude/skills/`. The `SKILL.md` format is identical to
 * Claude's, so the whole archive tree is placed verbatim.
 *
 * `.agents/skills/` is a shared, cross-tool location, so a placed skill is not a
 * Codex-private namespace — other agents that read the standard may see it too.
 */
export async function installSkill(args: { skill: ArchiveSkill }) {
  const { skill } = args;
  const { slug, skillMd, assets } = skill;
  const written: string[] = [];

  const dir = join(process.cwd(), '.agents', 'skills', slug);
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

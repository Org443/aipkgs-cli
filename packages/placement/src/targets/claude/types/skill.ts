import type { ArchiveSkill } from '@local/archive';
import { writeSkillTree } from '../../../io/writers.ts';

// Claude skills live under `.claude/skills/<slug>` — SKILL.md plus payload assets.
export async function installSkill(args: { skill: ArchiveSkill }) {
  const { skill } = args;
  return writeSkillTree({ dir: ['.claude', 'skills'], skill });
}

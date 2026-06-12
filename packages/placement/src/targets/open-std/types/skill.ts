import type { ArchiveSkill } from '@local/archive';
import { writeSkillTree } from '../../../io/writers.ts';

// The one asset the open standard defines: a `SKILL.md`-rooted folder under
// `.agents/skills/<slug>`, payload assets alongside at their original depth.
export async function installSkill(args: { skill: ArchiveSkill }) {
  const { skill } = args;
  return writeSkillTree({ dir: ['.agents', 'skills'], skill });
}

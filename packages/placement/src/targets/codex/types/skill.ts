import type { ArchiveSkill } from '@local/archive';
import { writeSkillTree } from '../../../io/writers.ts';

/**
 * Codex adopted the open agent-skills standard and discovers skills under
 * `.agents/skills/<slug>` — not `.codex/skills/` (the original experimental path)
 * and not Claude's `.claude/skills/`. The `SKILL.md` format is identical, so the
 * shared installer places the whole archive tree verbatim. `.agents/skills/` is a
 * shared, cross-tool location, so a placed skill is not a Codex-private namespace.
 */
export async function installSkill(args: { skill: ArchiveSkill }) {
  const { skill } = args;
  return writeSkillTree({ dir: ['.agents', 'skills'], skill });
}

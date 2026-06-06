import type { ArchiveRule, ArchiveSetup, ArchiveSkill, ArchiveSubagent, PackageRef } from '@local/archive';
import { installRule } from './rule.ts';
import { installSetup } from './setup.ts';
import { installSkill } from './skill.ts';
import { installSubagent } from './subagent.ts';

/**
 * A box fans its decoded children out into the Claude layout by delegating to the
 * per-type installers: rules → `.claude/rules`, subagents → `.claude/agents`,
 * skills → `.claude/skills/<slug>`, and the box's setup bundle → its script
 * payload under `.claude/scripts/<box-ref>` (keyed by the box itself).
 */
export async function installBox(args: {
  rules: ArchiveRule[];
  subagents: ArchiveSubagent[];
  skills: ArchiveSkill[];
  setup?: ArchiveSetup;
  pkgRef: PackageRef;
}) {
  const { rules, subagents, skills, setup, pkgRef } = args;

  const written: string[] = [];

  for (const rule of rules) {
    const result = await installRule({ rule });
    written.push(...result.written);
  }

  for (const subagent of subagents) {
    const result = await installSubagent({ subagent });
    written.push(...result.written);
  }

  for (const skill of skills) {
    const result = await installSkill({ skill });
    written.push(...result.written);
  }

  if (setup) {
    const result = await installSetup({ setup, pkgRef });
    written.push(...result.written);
  }

  return { written };
}

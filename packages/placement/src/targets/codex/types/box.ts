import { type BoxChildren, writeBoxChildren } from '../../../io/writers.ts';
import { installRule } from './rule.ts';
import { installSetup } from './setup.ts';
import { installSkill } from './skill.ts';
import { installSubagent } from './subagent.ts';

// Fans a box's decoded children out into the Codex layout: rules → `AGENTS.md`,
// subagents → `.codex/agents/<slug>.toml`, skills → `.agents/skills/<slug>`, and
// the box's setup bundle → its script payload (keyed by the box itself).
export async function installBox(args: BoxChildren) {
  const installers = { installRule, installSubagent, installSkill, installSetup };
  return writeBoxChildren({ ...args, installers });
}

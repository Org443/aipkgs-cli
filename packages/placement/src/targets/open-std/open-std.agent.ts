import { join } from 'node:path';
import { Agent, type PlacementResult } from '../../agent.abstract.ts';
import { installBox } from './types/box.ts';
import { installRule } from './types/rule.ts';
import { installSetup, removeSetup } from './types/setup.ts';
import { installSkill } from './types/skill.ts';
import { installSubagent } from './types/subagent.ts';

/**
 * The "Open Standard" target follows the Agent Skills open standard
 * (agentskills.io), which places skills under `.agents/skills/<slug>`. That spec
 * covers only skills, so the other asset types mirror the Claude layout rooted at
 * `.agents/` — rules at `.agents/rules`, subagents at `.agents/agents`, and setup
 * bundles under `.agents/scripts` with hooks/status line in
 * `.agents/settings.json` and MCP servers in `.agents/mcp.json`.
 */
export class OpenStdAgent extends Agent {
  protected installSkill = installSkill;
  protected installSubagent = installSubagent;
  protected installRule = installRule;
  protected installSetup = installSetup;
  protected installBox = installBox;

  protected removeRule({ refStr }: { refStr: string }): Promise<PlacementResult> {
    return this.removeFile({ dir: join('.agents', 'rules'), name: `${refStr}.md` });
  }

  protected removeSubagent({ refStr }: { refStr: string }): Promise<PlacementResult> {
    return this.removeFile({ dir: join('.agents', 'agents'), name: `${refStr}.md` });
  }

  protected removeSkill({ refStr }: { refStr: string }): Promise<PlacementResult> {
    return this.removeTree({ path: join(process.cwd(), '.agents', 'skills', refStr) });
  }

  protected async removeSetupBundle({ refStr }: { refStr: string }): Promise<PlacementResult> {
    const { removed } = await removeSetup({ ref: refStr });
    return { paths: removed, deps: [] };
  }
}

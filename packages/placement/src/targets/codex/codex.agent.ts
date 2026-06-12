import { join } from 'node:path';
import { Agent, type PlacementResult } from '../../agent.abstract.ts';
import { agentsConfig } from './agents-config.ts';
import { installBox } from './types/box.ts';
import { installRule } from './types/rule.ts';
import { installSetup, removeSetup } from './types/setup.ts';
import { installSkill } from './types/skill.ts';
import { installSubagent } from './types/subagent.ts';

export class CodexAgent extends Agent {
  protected installSkill = installSkill;
  protected installSubagent = installSubagent;
  protected installRule = installRule;
  protected installSetup = installSetup;
  protected installBox = installBox;

  protected async removeRule({ refStr }: { refStr: string }): Promise<PlacementResult> {
    await agentsConfig.removeRule({ slug: refStr });
    return { paths: [agentsConfig.path()], deps: [] };
  }

  protected removeSubagent({ refStr }: { refStr: string }): Promise<PlacementResult> {
    return this.removeFile({ dir: join('.codex', 'agents'), name: `${refStr}.toml` });
  }

  protected removeSkill({ refStr }: { refStr: string }): Promise<PlacementResult> {
    return this.removeTree({ path: join(process.cwd(), '.agents', 'skills', refStr) });
  }

  protected async removeSetupBundle({ refStr }: { refStr: string }): Promise<PlacementResult> {
    const { removed } = await removeSetup({ ref: refStr });
    return { paths: removed, deps: [] };
  }
}

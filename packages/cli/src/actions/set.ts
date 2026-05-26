import { AGENT_TARGETS, type AgentTarget } from '@local/archive';
import pc from 'picocolors';
import { ConfigFile } from '../files/config.ts';

export async function setTargetAction({ target }: { target: AgentTarget }) {
  await ConfigFile.setTarget(target);
  console.log(pc.green(`Target set to ${pc.bold(target)}.`));
}

export function isAgentTarget(value: string): value is AgentTarget {
  return (AGENT_TARGETS as readonly string[]).includes(value);
}

import type { AgentTarget } from '@local/archive';
import { claudeTarget } from './claude/index.ts';
import { codexTarget } from './codex/index.ts';
import type { Target } from './types.ts';

const TARGETS = new Map<AgentTarget, Target>([
  ['claude', claudeTarget],
  ['codex', codexTarget],
]);

export function routeTarget(target: AgentTarget): Target {
  const targetRoute = TARGETS.get(target);
  if (!targetRoute) {
    throw new Error(`Agent target "${target}" not found`);
  }
  return targetRoute;
}

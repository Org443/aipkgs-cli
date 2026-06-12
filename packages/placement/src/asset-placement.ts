import type { AIpkgArchive, Manifest } from '@local/archive';
import type { Agent, PlacementResult } from './agent.abstract.ts';
import { ClaudeAgent } from './targets/claude/claude.agent.ts';
import { CodexAgent } from './targets/codex/codex.agent.ts';
import { OpenStdAgent } from './targets/open-std/open-std.agent.ts';

const AGENTS = new Map<string, Agent>([
  ['claude', new ClaudeAgent()],
  ['codex', new CodexAgent()],
  ['open-std', new OpenStdAgent()],
]);

/**
 * Fans every placement operation out to each selected target agent, in order,
 * and merges their results. Sequential so per-target console output stays grouped;
 * the target list is small (one entry per installed agent).
 */
export const AssetPlacement = {
  async install(args: { archive: AIpkgArchive; targets: string[] }): Promise<PlacementResult> {
    const paths = [];
    const deps = [];
    for (const target of args.targets) {
      const agent = agentFor(target);
      const result = await agent.install(args);
      paths.push(...result.paths);
      deps.push(...result.deps);
    }
    return { paths, deps };
  },

  async remove(args: { type: Manifest['type']; refStr: string; targets: string[] }): Promise<PlacementResult> {
    const paths = [];
    const deps = [];
    for (const target of args.targets) {
      const agent = agentFor(target);
      const result = await agent.remove(args);
      paths.push(...result.paths);
      deps.push(...result.deps);
    }
    return { paths, deps };
  },
};

function agentFor(target: string): Agent {
  const agent = AGENTS.get(target);
  if (!agent) {
    const known = [...AGENTS.keys()].join(', ');
    throw new Error(`Unknown placement target "${target}" (known targets: ${known})`);
  }
  return agent;
}

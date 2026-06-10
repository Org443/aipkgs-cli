import type { AIpkgArchive, Manifest } from '@local/archive';
import type { Agent, InstallResult, RemoveResult } from './agent.abstract.ts';
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

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class AssetPlacement {
  static async install(args: { archive: AIpkgArchive; targets: string[] }): Promise<InstallResult> {
    const paths = [];
    const deps = [];
    for (const target of args.targets) {
      const agent = AGENTS.get(target);
      if (!agent) continue;

      const result = await agent.install(args);
      paths.push(...result.paths);
      deps.push(...result.deps);
    }
    return { paths, deps };
  }

  static async remove(args: { type: Manifest['type']; refStr: string; targets: string[] }): Promise<RemoveResult> {
    const paths = [];
    const deps = [];
    for (const target of args.targets) {
      const agent = AGENTS.get(target);
      if (!agent) continue;

      const result = await agent.remove(args);
      paths.push(...result.paths);
      deps.push(...result.deps);
    }
    return { paths, deps };
  }
}

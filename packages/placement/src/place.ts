import type { AIpkgArchive, AgentTarget, Manifest, McpEntry, TarEntry } from '@local/archive';
import { routeTarget } from './targets/index.ts';
import type { Target } from './targets/types.ts';

export const place = {
  async install(args: { archive: AIpkgArchive; slug: string; targets: AgentTarget[] }) {
    const { archive, slug, targets } = args;
    const results = await fanOut(targets, (route) => route.install({ archive, slug }));
    return { written: results.flatMap((r) => r.written), statusLine: lastStatusLine(results) };
  },

  async installFiles(args: { type: Manifest['type']; slug: string; files: TarEntry[]; targets: AgentTarget[] }) {
    const { type, slug, files, targets } = args;
    const results = await fanOut(targets, (route) => route.installFiles({ type, slug, files }));
    return { written: results.flatMap((r) => r.written), statusLine: lastStatusLine(results) };
  },

  async remove(args: { type: Manifest['type']; slug: string; targets: AgentTarget[] }) {
    const { type, slug, targets } = args;
    const results = await fanOut(targets, (route) => route.remove({ type, slug }));
    return { paths: results.map((r) => r.path) };
  },

  async installMcp(args: { slug: string; entry: McpEntry; targets: AgentTarget[] }) {
    const { slug, entry, targets } = args;
    const results = await fanOut(targets, (route) => route.installMcp({ slug, entry }));
    return { written: results.flatMap((r) => r.written) };
  },

  async removeMcp(args: { slug: string; targets: AgentTarget[] }) {
    const { slug, targets } = args;
    const results = await fanOut(targets, (route) => route.removeMcp({ slug }));
    const removed = results.filter((r) => r.removed);
    return { removed: removed.length > 0, paths: removed.map((r) => r.path) };
  },

  async setStatusLine(args: { slug: string; statusLine: Record<string, unknown>; targets: AgentTarget[] }) {
    const { slug, statusLine, targets } = args;
    const results = await fanOut(targets, (route) => route.setStatusLine({ slug, statusLine }));
    return { paths: results.map((r) => r.path) };
  },

  async clearStatusLine(args: { targets: AgentTarget[] }) {
    const { targets } = args;
    const results = await fanOut(targets, (route) => route.clearStatusLine());
    const removed = results.filter((r) => r.removed);
    return { removed: removed.length > 0, paths: removed.map((r) => r.path) };
  },
};

////
/// Helpers
//

// Run the same placement operation against each selected target's route, in
// order, and collect the per-target results. Sequential so console output stays
// grouped per target; the target list is small (one per installed agent).
async function fanOut<R>(targets: AgentTarget[], op: (route: Target) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (const target of targets) {
    results.push(await op(routeTarget(target)));
  }
  return results;
}

// A status line is single-valued, so when several targets each report one we
// keep the last defined value (preserves the prior "last write wins" behavior).
function lastStatusLine(results: { statusLine?: Record<string, unknown> }[]) {
  return results.reduce<Record<string, unknown> | undefined>((acc, r) => r.statusLine ?? acc, undefined);
}

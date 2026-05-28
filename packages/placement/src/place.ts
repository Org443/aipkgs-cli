import type { AIpkgArchive, AgentTarget, Manifest, McpEntry, TarEntry } from '@local/archive';
import { routeTarget } from './targets/index.ts';

export const place = {
  async install(args: { archive: AIpkgArchive; slug: string; target: AgentTarget }) {
    const { archive, slug, target } = args;
    const targetRoute = routeTarget(target);
    return targetRoute.install({ archive, slug });
  },

  async installFiles(args: {
    type: Manifest['type'];
    slug: string;
    files: TarEntry[];
    target: AgentTarget;
  }) {
    const { type, slug, files, target } = args;
    const targetRoute = routeTarget(target);
    return targetRoute.installFiles({ type, slug, files });
  },

  async remove(args: { type: Manifest['type']; slug: string; target: AgentTarget }) {
    const { type, slug, target } = args;
    const targetRoute = routeTarget(target);
    return targetRoute.remove({ type, slug });
  },

  async installMcp(args: { slug: string; entry: McpEntry; target: AgentTarget }) {
    const { slug, entry, target } = args;
    const targetRoute = routeTarget(target);
    return targetRoute.installMcp({ slug, entry });
  },

  async removeMcp(args: { slug: string; target: AgentTarget }) {
    const { slug, target } = args;
    const targetRoute = routeTarget(target);
    return targetRoute.removeMcp({ slug });
  },

  async setStatusLine(args: { slug: string; statusLine: Record<string, unknown>; target: AgentTarget }) {
    const { slug, statusLine, target } = args;
    const targetRoute = routeTarget(target);
    return targetRoute.setStatusLine({ slug, statusLine });
  },

  async clearStatusLine(args: { target: AgentTarget }) {
    const { target } = args;
    const targetRoute = routeTarget(target);
    return targetRoute.clearStatusLine();
  },
};

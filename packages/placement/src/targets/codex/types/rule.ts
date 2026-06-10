import type { ArchiveRule } from '@local/archive';
import { agentsConfig } from '../agents-config.ts';

/**
 * Codex has no per-rule files and no `@import` syntax — it reads a single
 * concatenated `AGENTS.md` per directory. So each rule is merged into the
 * project-root `AGENTS.md` as an aipkg-owned, comment-delimited block; the user's
 * own prose and other rules' blocks are preserved. See `agents-config.ts`.
 */
export async function installRule(args: { rule: ArchiveRule }) {
  const { rule } = args;
  await agentsConfig.upsertRule({ slug: rule.slug, body: rule.doc.toString() });
  return { written: [agentsConfig.path()] };
}

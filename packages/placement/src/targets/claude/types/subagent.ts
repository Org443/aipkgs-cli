import type { ArchiveSubagent } from '@local/archive';
import { writeDocFile } from '../../../io/writers.ts';

// Claude subagents are one flat markdown-with-front-matter file each at `.claude/agents/<slug>.md`.
export async function installSubagent(args: { subagent: ArchiveSubagent }) {
  const { subagent } = args;
  return writeDocFile({ dir: ['.claude', 'agents'], slug: subagent.slug, doc: subagent.doc });
}

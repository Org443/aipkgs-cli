import type { ArchiveSubagent } from '@local/archive';
import { writeDocFile } from '../../../io/writers.ts';

// One markdown-with-front-matter file per subagent at `.agents/agents/<slug>.md`.
export async function installSubagent(args: { subagent: ArchiveSubagent }) {
  const { subagent } = args;
  return writeDocFile({ dir: ['.agents', 'agents'], slug: subagent.slug, doc: subagent.doc });
}

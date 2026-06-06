import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchiveSubagent } from '@local/archive';

/**
 * Claude subagents are stored in the `.claude/agents/<slug>.md` file.
 * The `.claude/agents` directory is flat with no subdirectories — only agent
 * markdown files.
 */
export async function installSubagent(args: { subagent: ArchiveSubagent }) {
  const { subagent } = args;

  const dir = join(process.cwd(), '.claude', 'agents');
  await mkdir(dir, { recursive: true });

  const dest = join(dir, `${subagent.slug}.md`);
  await writeFile(dest, subagent.doc);

  return { written: [dest] };
}

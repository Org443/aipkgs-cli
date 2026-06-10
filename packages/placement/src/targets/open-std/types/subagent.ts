import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchiveSubagent } from '@local/archive';

// One markdown-with-front-matter file per subagent at `.agents/agents/<slug>.md`,
// written verbatim — flat, no subdirectories.
export async function installSubagent(args: { subagent: ArchiveSubagent }) {
  const { subagent } = args;

  const cwd = process.cwd();
  const dir = join(cwd, '.agents', 'agents');
  await mkdir(dir, { recursive: true });

  const dest = join(dir, `${subagent.slug}.md`);
  await writeFile(dest, subagent.doc);

  return { written: [dest] };
}

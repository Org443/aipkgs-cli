import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchiveRule } from '@local/archive';

/**
 * Claude rules are stored in the `.claude/rules/<slug>.md` file.
 * The `.claude/rules` directory is flat with no subdirectories — only rule
 * markdown files.
 */
export async function installRule(args: { rule: ArchiveRule }) {
  const { rule } = args;

  const dir = join(process.cwd(), '.claude', 'rules');
  await mkdir(dir, { recursive: true });

  const dest = join(dir, `${rule.slug}.md`);
  await writeFile(dest, rule.doc);

  return { written: [dest] };
}

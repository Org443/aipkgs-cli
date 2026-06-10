import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchiveRule } from '@local/archive';

// One markdown file per rule at `.agents/rules/<slug>.md` — flat, no subdirectories.
export async function installRule(args: { rule: ArchiveRule }) {
  const { rule } = args;

  const cwd = process.cwd();
  const dir = join(cwd, '.agents', 'rules');
  await mkdir(dir, { recursive: true });

  const dest = join(dir, `${rule.slug}.md`);
  await writeFile(dest, rule.doc);

  return { written: [dest] };
}

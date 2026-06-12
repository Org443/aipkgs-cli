import type { ArchiveRule } from '@local/archive';
import { writeDocFile } from '../../../io/writers.ts';

// One markdown file per rule at `.agents/rules/<slug>.md` — flat, no subdirectories.
export async function installRule(args: { rule: ArchiveRule }) {
  const { rule } = args;
  return writeDocFile({ dir: ['.agents', 'rules'], slug: rule.slug, doc: rule.doc });
}

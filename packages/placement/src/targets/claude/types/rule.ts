import type { ArchiveRule } from '@local/archive';
import { writeDocFile } from '../../../io/writers.ts';

// Claude rules are one flat markdown file each at `.claude/rules/<slug>.md`.
export async function installRule(args: { rule: ArchiveRule }) {
  const { rule } = args;
  return writeDocFile({ dir: ['.claude', 'rules'], slug: rule.slug, doc: rule.doc });
}

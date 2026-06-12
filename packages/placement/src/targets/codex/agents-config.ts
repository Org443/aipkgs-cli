import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isENOENT } from '@local/archive';

// Codex has no per-rule files — it reads a single concatenated `AGENTS.md` (and
// has no import syntax). So each rule lives as an aipkg-owned, comment-delimited
// block inside the project-root AGENTS.md. The user's own prose and other rules'
// blocks are preserved; only this slug's block is added/replaced/removed.
export const AGENTS_FILENAME = 'AGENTS.md';

export const agentsConfig = {
  path(): string {
    return join(process.cwd(), AGENTS_FILENAME);
  },

  async read(): Promise<string> {
    try {
      return await readFile(agentsConfig.path(), 'utf8');
    } catch (err) {
      if (isENOENT(err)) return '';
      throw err;
    }
  },

  async write(content: string) {
    await writeFile(agentsConfig.path(), content, 'utf8');
  },

  async upsertRule(args: { slug: string; body: string }) {
    const { slug, body } = args;
    const existing = await agentsConfig.read();
    const base = tidy(stripBlock({ content: existing, slug }).result);
    const block = renderBlock({ slug, body: body.trim() });
    const next = base.length > 0 ? `${base}\n\n${block}\n` : `${block}\n`;
    await agentsConfig.write(next);
  },

  async removeRule(args: { slug: string }) {
    const { slug } = args;
    const existing = await agentsConfig.read();
    const { result, changed } = stripBlock({ content: existing, slug });
    if (!changed) return false;

    const remaining = tidy(result);
    // If our block was the only thing in the file, don't leave an empty AGENTS.md behind.
    if (remaining.length === 0) await rm(agentsConfig.path(), { force: true });
    else await agentsConfig.write(`${remaining}\n`);
    return true;
  },
};

////
/// Helpers
//

function markers(slug: string) {
  return { start: `<!-- aipkg:rule:${slug} start -->`, end: `<!-- aipkg:rule:${slug} end -->` };
}

function renderBlock(args: { slug: string; body: string }): string {
  const { slug, body } = args;
  const { start, end } = markers(slug);
  return `${start}\n${body}\n${end}`;
}

function stripBlock(args: { content: string; slug: string }): { result: string; changed: boolean } {
  const { content, slug } = args;
  const { start, end } = markers(slug);
  const re = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (!re.test(content)) return { result: content, changed: false };
  return { result: content.replace(re, ''), changed: true };
}

// Collapse the runs of blank lines a removal can leave behind and trim the edges.
function tidy(content: string): string {
  return content.replace(/\n{3,}/g, '\n\n').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

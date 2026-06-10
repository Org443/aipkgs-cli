import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchiveSubagent } from '@local/archive';
import { stringify } from 'smol-toml';

/**
 * Codex subagents are TOML at `.codex/agents/<slug>.toml`, not Claude's
 * Markdown-with-front-matter. The source doc is converted:
 *
 * - `name` = the install slug (Codex treats `name` as the authoritative identifier
 *   and expects it to match the filename).
 * - `description` = the source front-matter `description` (falls back to the slug).
 * - `developer_instructions` = the Markdown body (front-matter stripped).
 *
 * `tools` and `model` are intentionally dropped: Codex has no per-agent `tools`
 * allowlist, and Claude model names (e.g. `sonnet`) are not valid Codex models, so
 * omitting `model` inherits the parent session's model.
 */
export async function installSubagent(args: { subagent: ArchiveSubagent }) {
  const { subagent } = args;
  const { slug, doc } = subagent;

  const { description, body } = splitFrontMatter(doc.toString());

  const dir = join(process.cwd(), '.codex', 'agents');
  await mkdir(dir, { recursive: true });

  const agent = {
    name: slug,
    description: description ?? slug,
    developer_instructions: body,
  };

  const dest = join(dir, `${slug}.toml`);
  await writeFile(dest, stringify(agent));

  return { written: [dest] };
}

////
/// Helpers
//

// Split a leading YAML front-matter block (`---\n…\n---`) off the body and pull a
// single-line `description`. Codex agents only need the description; the rest of
// the front-matter (name/tools/model) is dropped, so this is a deliberately
// minimal scan, not a full YAML parse.
function splitFrontMatter(doc: string): { description?: string; body: string } {
  const match = doc.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontMatter = match?.[1];
  if (!match || frontMatter === undefined) return { body: doc.trim() };

  const body = doc.slice(match[0].length).trim();

  const descLine = frontMatter.split('\n').find((line) => /^description\s*:/.test(line));
  if (!descLine) return { body };

  const value = descLine.replace(/^description\s*:/, '').trim();
  const description = stripQuotes(value);
  return { description: description.length > 0 ? description : undefined, body };
}

function stripQuotes(value: string): string {
  const quote = value[0];
  if (value.length >= 2 && (quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  return value;
}

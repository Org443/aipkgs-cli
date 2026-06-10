import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { parse } from 'smol-toml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTestFile, setupTestCwd, teardownTestCwd, testFileExists } from '../../../../test/helpers.ts';
import { installSubagent } from '../subagent.ts';

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

function asserted(files: TarEntry[]) {
  const manifest = new Manifest({ type: 'subagent', ref: 'acme/researcher', version: '1.0.0' });
  const { subagents } = archiveService.assert({ manifest, files });
  // biome-ignore lint/style/noNonNullAssertion: a subagent archive always decodes to one subagent
  return subagents[0]!;
}

async function readToml(path: string) {
  return parse(await readTestFile(path)) as Record<string, unknown>;
}

beforeEach(() => setupTestCwd({ prefix: 'aipkg-codex-subagent-' }));
afterEach(teardownTestCwd);

describe('installSubagent', () => {
  it('converts the markdown to a TOML agent at .codex/agents/<slug>.toml', async () => {
    const doc =
      '---\nname: researcher\ndescription: Researches things\ntools: Read, Grep\nmodel: sonnet\n---\nDo research.';
    const subagent = asserted([file('aipkg.json'), file('researcher.md', doc)]);

    const { written } = await installSubagent({ subagent });

    expect(written).toEqual([expect.stringMatching(/\.codex\/agents\/researcher\.toml$/)]);
    const agent = await readToml('.codex/agents/researcher.toml');
    // name is the slug, description from front-matter, body becomes developer_instructions.
    // tools/model are intentionally dropped — Codex has no per-agent tools and Claude
    // model names are invalid for Codex.
    expect(agent).toEqual({
      name: 'researcher',
      description: 'Researches things',
      developer_instructions: 'Do research.',
    });
  });

  it('falls back to the slug for description when front-matter has none', async () => {
    const subagent = asserted([file('aipkg.json'), file('researcher.md', '# researcher\nNo front-matter here.')]);

    await installSubagent({ subagent });

    const agent = await readToml('.codex/agents/researcher.toml');
    expect(agent.description).toBe('researcher');
    expect(agent.developer_instructions).toBe('# researcher\nNo front-matter here.');
  });

  it('keeps the agents directory flat — only the converted toml, no manifest or cruft', async () => {
    const subagent = asserted([file('aipkg.json'), file('researcher.md', '# researcher'), file('.DS_Store', 'junk')]);

    const { written } = await installSubagent({ subagent });

    expect(written).toHaveLength(1);
    expect(testFileExists('.codex/agents/aipkg.json')).toBe(false);
    expect(testFileExists('.codex/agents/researcher.md')).toBe(false);
  });
});

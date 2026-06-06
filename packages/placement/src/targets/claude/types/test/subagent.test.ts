import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTestFile, setupTestCwd, teardownTestCwd, testFileExists } from '../../../../test/helpers.ts';
import { installSubagent } from '../subagent.ts';

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

// Run the raw tar entries through archiveService.assert so each test installs from
// exactly the decoded subagent a real subagent archive carries.
function asserted(files: TarEntry[]) {
  const manifest = new Manifest({ type: 'subagent', ref: 'acme/researcher', version: '1.0.0' });
  const { subagents } = archiveService.assert({ manifest, files });
  // biome-ignore lint/style/noNonNullAssertion: a subagent archive always decodes to one subagent
  return subagents[0]!;
}

beforeEach(() => setupTestCwd({ prefix: 'aipkg-claude-subagent-' }));
afterEach(teardownTestCwd);

describe('installSubagent', () => {
  it('places the subagent markdown at .claude/agents/<slug>.md', async () => {
    const subagent = asserted([file('aipkg.json'), file('researcher.md', '# researcher')]);

    const { written } = await installSubagent({ subagent });

    expect(written).toEqual([expect.stringMatching(/\.claude\/agents\/researcher\.md$/)]);
    expect(await readTestFile('.claude/agents/researcher.md')).toBe('# researcher');
  });

  it('keeps the agents directory flat — only the agent markdown, no manifest or pruned cruft', async () => {
    const subagent = asserted([file('aipkg.json'), file('researcher.md', '# researcher'), file('.DS_Store', 'junk')]);

    const { written } = await installSubagent({ subagent });

    expect(written).toHaveLength(1);
    expect(testFileExists('.claude/agents/aipkg.json')).toBe(false);
    expect(testFileExists('.claude/agents/.DS_Store')).toBe(false);
  });
});

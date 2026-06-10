import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTestFile, setupTestCwd, teardownTestCwd, testFileExists } from '../../../../test/helpers.ts';
import { installRule } from '../rule.ts';

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

// Run the raw tar entries through archiveService.assert so each test installs from
// exactly the decoded rule a real rule archive carries.
function asserted(files: TarEntry[]) {
  const manifest = new Manifest({ type: 'rule', ref: 'acme/no-any', version: '1.0.0' });
  const { rules } = archiveService.assert({ manifest, files });
  // biome-ignore lint/style/noNonNullAssertion: a rule archive always decodes to one rule
  return rules[0]!;
}

beforeEach(() => setupTestCwd({ prefix: 'aipkg-open-std-rule-' }));
afterEach(teardownTestCwd);

describe('installRule', () => {
  it('places the rule markdown at .agents/rules/<slug>.md', async () => {
    const rule = asserted([file('aipkg.json'), file('no-any.md', '# no-any\nNo `any`.')]);

    const { written } = await installRule({ rule });

    expect(written).toEqual([expect.stringMatching(/\.agents\/rules\/no-any\.md$/)]);
    expect(await readTestFile('.agents/rules/no-any.md')).toBe('# no-any\nNo `any`.');
  });

  it('keeps the rules directory flat — only the rule markdown, no manifest or pruned cruft', async () => {
    const rule = asserted([file('aipkg.json'), file('no-any.md', '# no-any'), file('.DS_Store', 'junk')]);

    const { written } = await installRule({ rule });

    expect(written).toHaveLength(1);
    expect(testFileExists('.agents/rules/aipkg.json')).toBe(false);
    expect(testFileExists('.agents/rules/.DS_Store')).toBe(false);
  });
});

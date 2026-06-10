import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readTestFile,
  setupTestCwd,
  teardownTestCwd,
  testFileExists,
  writeTestFile,
} from '../../../../test/helpers.ts';
import { installRule } from '../rule.ts';

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

function asserted(files: TarEntry[]) {
  const manifest = new Manifest({ type: 'rule', ref: 'acme/no-any', version: '1.0.0' });
  const { rules } = archiveService.assert({ manifest, files });
  // biome-ignore lint/style/noNonNullAssertion: a rule archive always decodes to one rule
  return rules[0]!;
}

beforeEach(() => setupTestCwd({ prefix: 'aipkg-codex-rule-' }));
afterEach(teardownTestCwd);

describe('installRule', () => {
  it('merges the rule into AGENTS.md as an aipkg-owned block', async () => {
    const rule = asserted([file('aipkg.json'), file('no-any.md', '# no-any\nNo `any`.')]);

    const { written } = await installRule({ rule });

    expect(written).toEqual([expect.stringMatching(/AGENTS\.md$/)]);
    const agents = await readTestFile('AGENTS.md');
    expect(agents).toContain('<!-- aipkg:rule:no-any start -->');
    expect(agents).toContain('# no-any\nNo `any`.');
    expect(agents).toContain('<!-- aipkg:rule:no-any end -->');
  });

  it('preserves the user’s existing AGENTS.md prose', async () => {
    await writeTestFile('# My project\nHand-written guidance.\n', 'AGENTS.md');
    const rule = asserted([file('aipkg.json'), file('no-any.md', 'No any.')]);

    await installRule({ rule });

    const agents = await readTestFile('AGENTS.md');
    expect(agents).toContain('Hand-written guidance.');
    expect(agents).toContain('<!-- aipkg:rule:no-any start -->');
    // Codex reads a single concatenated AGENTS.md — there is no rules/ directory.
    expect(testFileExists('.codex/rules')).toBe(false);
    expect(testFileExists('.claude')).toBe(false);
  });
});

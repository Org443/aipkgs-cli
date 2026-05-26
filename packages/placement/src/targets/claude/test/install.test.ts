import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTestArchive,
  readTestFile,
  setupTestCwd,
  teardownTestCwd,
  testFileExists,
  writeTestFile,
} from '../../../test/helpers.ts';
import { install, remove } from '../install.ts';

beforeEach(() => setupTestCwd({ prefix: 'aipkg-claude-install-' }));
afterEach(teardownTestCwd);

describe('install', () => {
  it('writes a cmd to .claude/commands/<slug>.md', async () => {
    const archive = await buildTestArchive({ type: 'cmd', slug: 'pr-create' });

    const { written } = await install({ archive, slug: 'pr-create' });

    expect(written).toEqual([expect.stringMatching(/\.claude\/commands\/pr-create\.md$/)]);
    expect(await readTestFile('.claude', 'commands', 'pr-create.md')).toBe('# pr-create\nTest content.');
  });

  it('writes a subagent to .claude/agents/<slug>.md', async () => {
    const archive = await buildTestArchive({ type: 'subagent', slug: 'reviewer' });

    const { written } = await install({ archive, slug: 'reviewer' });

    expect(written).toEqual([expect.stringMatching(/\.claude\/agents\/reviewer\.md$/)]);
    expect(await readTestFile('.claude', 'agents', 'reviewer.md')).toBe('# reviewer\nTest content.');
  });

  it('writes a rule to .claude/rules/<slug>.md', async () => {
    const archive = await buildTestArchive({ type: 'rule', slug: 'no-any' });

    const { written } = await install({ archive, slug: 'no-any' });

    expect(written).toEqual([expect.stringMatching(/\.claude\/rules\/no-any\.md$/)]);
    expect(await readTestFile('.claude', 'rules', 'no-any.md')).toBe('# no-any\nTest content.');
  });

  it('honors an alias slug different from the manifest ref', async () => {
    const archive = await buildTestArchive({ type: 'cmd', slug: 'pr-create' });

    await install({ archive, slug: 'open-pr' });

    expect(testFileExists('.claude', 'commands', 'open-pr.md')).toBe(true);
    expect(testFileExists('.claude', 'commands', 'pr-create.md')).toBe(false);
  });

  it('writes a skill as a directory tree under .claude/skills/<slug>/', async () => {
    const archive = await buildTestArchive({
      type: 'skill',
      slug: 'pr-helper',
      files: [
        { path: 'SKILL.md', body: Buffer.from('# pr-helper') },
        { path: 'README.md', body: Buffer.from('docs') },
        { path: 'assets/diagram.txt', body: Buffer.from('drawing') },
      ],
    });

    const { written } = await install({ archive, slug: 'pr-helper' });

    expect(written).toHaveLength(3);
    expect(await readTestFile('.claude', 'skills', 'pr-helper', 'SKILL.md')).toBe('# pr-helper');
    expect(await readTestFile('.claude', 'skills', 'pr-helper', 'README.md')).toBe('docs');
    expect(await readTestFile('.claude', 'skills', 'pr-helper', 'assets', 'diagram.txt')).toBe('drawing');
  });
});

describe('remove', () => {
  it('removes a cmd file and returns its path', async () => {
    await writeTestFile('# pr-create', '.claude', 'commands', 'pr-create.md');

    const { path } = await remove({ type: 'cmd', slug: 'pr-create' });

    expect(path).toMatch(/\.claude\/commands\/pr-create\.md$/);
    expect(testFileExists('.claude', 'commands', 'pr-create.md')).toBe(false);
  });

  it('removes a skill directory recursively', async () => {
    await writeTestFile('# pr-helper', '.claude', 'skills', 'pr-helper', 'SKILL.md');
    await writeTestFile('docs', '.claude', 'skills', 'pr-helper', 'README.md');
    await writeTestFile('drawing', '.claude', 'skills', 'pr-helper', 'assets', 'diagram.txt');

    await remove({ type: 'skill', slug: 'pr-helper' });

    expect(testFileExists('.claude', 'skills', 'pr-helper')).toBe(false);
  });

  it('does not throw when the target file is missing', async () => {
    const { path } = await remove({ type: 'cmd', slug: 'nope' });
    expect(path).toMatch(/\.claude\/commands\/nope\.md$/);
  });

  it('throws when removing a box package', async () => {
    await expect(remove({ type: 'box', slug: 'app' })).rejects.toThrow(/Cannot place a box package/);
  });
});

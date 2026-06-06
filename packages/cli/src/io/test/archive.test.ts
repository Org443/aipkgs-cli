import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupTestCwd, teardownTestCwd, testDir, writeTestFile } from '../../test/helpers.ts';
import { collectArchiveFiles } from '../collect-files.ts';

beforeEach(() => {
  setupTestCwd({ prefix: 'aipkg-archive-collect-test-' });
});

afterEach(() => {
  teardownTestCwd();
});

function paths(entries: { path: string }[]) {
  return entries.map((e) => e.path).sort();
}

function bodyFor(entries: { path: string; body: Buffer }[], path: string) {
  const hit = entries.find((e) => e.path === path);
  if (!hit) throw new Error(`No entry at ${path}; got: ${entries.map((e) => e.path).join(', ')}`);
  return hit.body.toString('utf8');
}

describe('collectArchiveFiles', () => {
  it('throws when the path is not a directory', async () => {
    await writeTestFile('# rule', 'pr-create.md');
    await expect(collectArchiveFiles({ dir: testDir('pr-create.md') })).rejects.toThrow();
  });

  it('walks every nested file, re-rooted to the package directory', async () => {
    await writeTestFile('# skill body', 'SKILL.md');
    await writeTestFile('# readme', 'README.md');
    await writeTestFile('logo-bytes', 'assets/logo.txt');
    await writeTestFile('echo hi', 'scripts/run.sh');
    await writeTestFile('ref', 'references/cheatsheet.md');

    const entries = await collectArchiveFiles({ dir: testDir() });

    expect(paths(entries)).toEqual([
      'README.md',
      'SKILL.md',
      'assets/logo.txt',
      'references/cheatsheet.md',
      'scripts/run.sh',
    ]);
    expect(bodyFor(entries, 'assets/logo.txt')).toBe('logo-bytes');
  });

  it('collection is type-agnostic — a box layout is swept verbatim', async () => {
    await writeTestFile(JSON.stringify({ type: 'box', ref: 'org443/my-box', version: '1.0.0' }), 'aipkg.json');
    await writeTestFile('# helper skill', 'skills/helper/SKILL.md');
    await writeTestFile('logo-bytes', 'skills/helper/assets/logo.txt');
    await writeTestFile('{"PreToolUse":[]}', 'setup.json');
    await writeTestFile('#!/bin/sh', 'scripts/lint.sh');
    await writeTestFile('# pr-create', 'rules/pr-create.md');
    await writeTestFile('# reviewer', 'subagents/reviewer.md');

    const entries = await collectArchiveFiles({ dir: testDir() });

    expect(paths(entries)).toEqual([
      'rules/pr-create.md',
      'scripts/lint.sh',
      'setup.json',
      'skills/helper/SKILL.md',
      'skills/helper/assets/logo.txt',
      'subagents/reviewer.md',
    ]);
  });

  describe('manifest handling', () => {
    it('skips the on-disk aipkg.json — re-emitted by the archive layer', async () => {
      await writeTestFile(JSON.stringify({ type: 'skill', ref: 'org/x', version: '1.0.0' }), 'aipkg.json');
      await writeTestFile('# skill', 'SKILL.md');

      const entries = await collectArchiveFiles({ dir: testDir() });

      expect(paths(entries)).toEqual(['SKILL.md']);
    });

    it('skips a caller-provided alternate manifest filename', async () => {
      await writeTestFile('{}', 'aipkg.alt.json');
      await writeTestFile('# skill', 'SKILL.md');

      const entries = await collectArchiveFiles({ dir: testDir(), manifestFilename: 'aipkg.alt.json' });

      expect(paths(entries)).toEqual(['SKILL.md']);
    });
  });

  describe('.aipkgignore', () => {
    it('excludes matching files and the ignore file itself', async () => {
      await writeTestFile('# skill', 'SKILL.md');
      await writeTestFile('secret', '.env');
      await writeTestFile('scratch', 'notes.md');
      await writeTestFile('.env\nnotes.md\n', '.aipkgignore');

      const entries = await collectArchiveFiles({ dir: testDir() });

      expect(paths(entries)).toEqual(['SKILL.md']);
    });

    it('excludes a directory and everything under it', async () => {
      await writeTestFile('# skill', 'SKILL.md');
      await writeTestFile('keep', 'assets/logo.txt');
      await writeTestFile('drop', 'fixtures/a.json');
      await writeTestFile('drop', 'fixtures/nested/b.json');
      await writeTestFile('fixtures/\n', '.aipkgignore');

      const entries = await collectArchiveFiles({ dir: testDir() });

      expect(paths(entries)).toEqual(['SKILL.md', 'assets/logo.txt']);
    });

    it('supports glob patterns', async () => {
      await writeTestFile('# skill', 'SKILL.md');
      await writeTestFile('log', 'debug.log');
      await writeTestFile('log', 'scripts/run.log');
      await writeTestFile('keep', 'scripts/run.sh');
      await writeTestFile('*.log\n', '.aipkgignore');

      const entries = await collectArchiveFiles({ dir: testDir() });

      expect(paths(entries)).toEqual(['SKILL.md', 'scripts/run.sh']);
    });
  });

  it('never publishes .env files, but keeps committed templates', async () => {
    await writeTestFile('# skill', 'SKILL.md');
    await writeTestFile('SECRET=1', '.env');
    await writeTestFile('SECRET=2', '.env.local');
    await writeTestFile('SECRET=3', 'config/.env.production');
    await writeTestFile('SECRET=', '.env.example');

    const entries = await collectArchiveFiles({ dir: testDir() });

    expect(paths(entries)).toEqual(['.env.example', 'SKILL.md']);
  });

  it('never descends into heavy directories like node_modules', async () => {
    await writeTestFile('# skill', 'SKILL.md');
    await writeTestFile('junk', 'node_modules/dep/index.js');
    await writeTestFile('junk', '.git/config');

    const entries = await collectArchiveFiles({ dir: testDir() });

    expect(paths(entries)).toEqual(['SKILL.md']);
  });
});

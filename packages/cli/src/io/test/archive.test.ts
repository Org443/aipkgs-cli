import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestCwd, teardownTestCwd, testDir, writeTestFile } from '../../test/helpers.ts';
import { collectArchiveFiles } from '../archive.ts';

beforeEach(() => {
  setupTestCwd({ prefix: 'aipkg-archive-collect-test-' });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  teardownTestCwd();
  vi.restoreAllMocks();
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
  describe('type: cmd', () => {
    it('emits <slug>.md alone when no sidecars are present', async () => {
      await writeTestFile('# pr-create', 'pr-create.md');

      const entries = await collectArchiveFiles({
        type: 'cmd',
        dir: testDir(),
        slug: 'pr-create',
      });

      expect(paths(entries)).toEqual(['pr-create.md']);
      expect(bodyFor(entries, 'pr-create.md')).toBe('# pr-create');
    });

    it('emits <slug>.md plus README, HERO_CARD, and LICENSE sidecars', async () => {
      await writeTestFile('# pr-create', 'pr-create.md');
      await writeTestFile('# readme', 'README.md');
      await writeTestFile('# hero', 'HERO_CARD.md');
      await writeTestFile('mit', 'LICENSE.txt');

      const entries = await collectArchiveFiles({
        type: 'cmd',
        dir: testDir(),
        slug: 'pr-create',
      });

      expect(paths(entries)).toEqual(['HERO_CARD.md', 'LICENSE.txt', 'README.md', 'pr-create.md']);
    });
  });

  describe('type: rule', () => {
    it('emits <slug>.md plus sidecars', async () => {
      await writeTestFile('# safety', 'safety.md');
      await writeTestFile('# readme', 'README.md');

      const entries = await collectArchiveFiles({
        type: 'rule',
        dir: testDir(),
        slug: 'safety',
      });

      expect(paths(entries)).toEqual(['README.md', 'safety.md']);
    });
  });

  describe('type: subagent', () => {
    it('emits <slug>.md plus sidecars', async () => {
      await writeTestFile('# reviewer', 'reviewer.md');
      await writeTestFile('mit', 'LICENSE.txt');

      const entries = await collectArchiveFiles({
        type: 'subagent',
        dir: testDir(),
        slug: 'reviewer',
      });

      expect(paths(entries)).toEqual(['LICENSE.txt', 'reviewer.md']);
    });
  });

  describe('type: skill', () => {
    it('packs SKILL.md and every nested file in the directory', async () => {
      await writeTestFile('# skill body', 'SKILL.md');
      await writeTestFile('# readme', 'README.md');
      await writeTestFile('logo-bytes', 'assets/logo.txt');
      await writeTestFile('echo hi', 'scripts/run.sh');
      await writeTestFile('ref', 'references/cheatsheet.md');

      const entries = await collectArchiveFiles({
        type: 'skill',
        dir: testDir(),
        slug: 'pr-helper',
      });

      expect(paths(entries)).toEqual([
        'README.md',
        'SKILL.md',
        'assets/logo.txt',
        'references/cheatsheet.md',
        'scripts/run.sh',
      ]);
      expect(bodyFor(entries, 'assets/logo.txt')).toBe('logo-bytes');
    });

    it('skips the on-disk aipkg.json (manifest is re-emitted by the archive layer)', async () => {
      await writeTestFile(JSON.stringify({ type: 'skill', ref: 'org/x', version: '1.0.0' }), 'aipkg.json');
      await writeTestFile('# skill', 'SKILL.md');

      const entries = await collectArchiveFiles({
        type: 'skill',
        dir: testDir(),
        slug: 'x',
      });

      expect(paths(entries)).toEqual(['SKILL.md']);
    });

    it('skips a caller-provided alternate manifest filename', async () => {
      await writeTestFile('{}', 'aipkg.alt.json');
      await writeTestFile('# skill', 'SKILL.md');

      const entries = await collectArchiveFiles({
        type: 'skill',
        dir: testDir(),
        slug: 'x',
        manifestFilename: 'aipkg.alt.json',
      });

      expect(paths(entries)).toEqual(['SKILL.md']);
    });
  });

  describe('type: hook', () => {
    it('packs hooks.json and every nested file in the directory', async () => {
      await writeTestFile('{"hooks":[]}', 'hooks.json');
      await writeTestFile('# readme', 'README.md');
      await writeTestFile('#!/bin/sh', 'scripts/lint.sh');

      const entries = await collectArchiveFiles({
        type: 'hook',
        dir: testDir(),
        slug: 'lint',
      });

      expect(paths(entries)).toEqual(['README.md', 'hooks.json', 'scripts/lint.sh']);
      expect(bodyFor(entries, 'hooks.json')).toBe('{"hooks":[]}');
    });
  });

  describe('type: box', () => {
    it('collects nested skills/hooks under <key>/<slug>/** and flat md files under <key>/', async () => {
      // Root manifest — not collected here, re-emitted by the archive layer.
      await writeTestFile(JSON.stringify({ type: 'box', ref: 'org443/my-box', version: '1.0.0' }), 'aipkg.json');

      // skills/<slug>/**
      await writeTestFile('# helper skill', 'skills/helper/SKILL.md');
      await writeTestFile('logo-bytes', 'skills/helper/assets/logo.txt');

      // hooks/<slug>/**
      await writeTestFile('{"hooks":[]}', 'hooks/hooks.json');
      await writeTestFile('# readme', 'hooks/script.cmd');
      await writeTestFile('#!/bin/sh', 'hooks/scripts/lint.sh');

      // cmds/*.md
      await writeTestFile('# pr-create', 'cmds/pr-create.md');

      // rules/*.md
      await writeTestFile('# safety', 'rules/safety.md');

      // subagents/*.md
      await writeTestFile('# reviewer', 'subagents/reviewer.md');

      const entries = await collectArchiveFiles({
        type: 'box',
        dir: testDir(),
        slug: 'my-box',
      });

      expect(paths(entries)).toEqual([
        'cmds/pr-create.md',
        'hooks/hooks.json',
        'hooks/script.cmd',
        'hooks/scripts/lint.sh',
        'rules/safety.md',
        'skills/helper/SKILL.md',
        'skills/helper/assets/logo.txt',
        'subagents/reviewer.md',
      ]);
    });

    it('skips dep keys whose directory does not exist', async () => {
      await writeTestFile('# pr-create', 'cmds/pr-create.md');

      const entries = await collectArchiveFiles({
        type: 'box',
        dir: testDir(),
        slug: 'my-box',
      });

      expect(paths(entries)).toEqual(['cmds/pr-create.md']);
    });

    it('includes README, HERO_CARD, and LICENSE sidecars at the box root', async () => {
      await writeTestFile(JSON.stringify({ type: 'box', ref: 'org/x', version: '1.0.0' }), 'aipkg.json');
      await writeTestFile('# readme', 'README.md');
      await writeTestFile('# hero', 'HERO_CARD.md');
      await writeTestFile('mit', 'LICENSE.txt');
      await writeTestFile('# pr-create', 'cmds/pr-create.md');

      const entries = await collectArchiveFiles({
        type: 'box',
        dir: testDir(),
        slug: 'my-box',
      });

      expect(paths(entries)).toEqual(['HERO_CARD.md', 'LICENSE.txt', 'README.md', 'cmds/pr-create.md']);
      expect(bodyFor(entries, 'README.md')).toBe('# readme');
    });

    it('ignores the boxes/ dep key (boxes do not nest inside boxes)', async () => {
      await writeTestFile(
        JSON.stringify({ type: 'box', ref: 'org/inner', version: '1.0.0' }),
        'boxes/inner/aipkg.json',
      );
      await writeTestFile('# pr-create', 'cmds/pr-create.md');

      const entries = await collectArchiveFiles({
        type: 'box',
        dir: testDir(),
        slug: 'my-box',
      });

      expect(paths(entries)).toEqual(['cmds/pr-create.md']);
    });
  });
});

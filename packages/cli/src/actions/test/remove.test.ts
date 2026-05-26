import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_LOCKFILE,
  EMPTY_MANIFEST,
  readTestJson,
  setupTestCwd,
  teardownTestCwd,
  testDir,
  testFileExists,
  writeTestFile,
} from '../../test/helpers.ts';
import { removeAction } from '../remove.ts';

beforeEach(async () => {
  setupTestCwd({ prefix: 'aipkg-remove-test-' });
  process.env.AIPKG_TARGET = 'claude';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await writeTestFile(EMPTY_MANIFEST, 'aipkg.json');
  await writeTestFile(EMPTY_LOCKFILE, 'aipkg.lock');
});

afterEach(() => {
  teardownTestCwd();
  vi.restoreAllMocks();
  process.env.AIPKG_TARGET = undefined;
});

async function seedCmd(args: { slug: string; ref: string; version: string; sha?: string }) {
  const { slug, ref, version, sha = 'sha256:abc' } = args;
  const aipkgRef = `aipkg://${ref}@${version === 'latest' ? 'latest' : version}`;
  const parent = {
    type: 'box',
    ref: 'test/app',
    version: '0.0.0',
    deps: { cmds: { [slug]: aipkgRef } },
  };
  await writeTestFile(JSON.stringify(parent), 'aipkg.json');
  await writeTestFile(JSON.stringify({ deps: { cmds: { [slug]: { aipkgRef, version, sha } } } }), 'aipkg.lock');
  await writeTestFile(`# ${slug}`, '.claude', 'commands', `${slug}.md`);
  return { aipkgRef };
}

async function seedSkill(args: { slug: string; ref: string; version: string }) {
  const { slug, ref, version } = args;
  const aipkgRef = `aipkg://${ref}@${version}`;
  const parent = {
    type: 'box',
    ref: 'test/app',
    version: '0.0.0',
    deps: { skills: { [slug]: aipkgRef } },
  };
  await writeTestFile(JSON.stringify(parent), 'aipkg.json');
  await writeTestFile(
    JSON.stringify({ deps: { skills: { [slug]: { aipkgRef, version, sha: 'sha256:def' } } } }),
    'aipkg.lock',
  );
  const skillDir = testDir('.claude', 'skills', slug);
  await mkdir(skillDir, { recursive: true });
  await writeFile(join(skillDir, 'SKILL.md'), '# skill');
  await writeFile(join(skillDir, 'README.md'), 'docs');
  return { aipkgRef };
}

describe('removeAction', () => {
  describe('happy path', () => {
    it('removes a cmd from disk, manifest, and lockfile', async () => {
      await seedCmd({
        slug: 'pr-create',
        ref: 'cmd/org443/pr-create',
        version: 'latest',
      });

      expect(testFileExists('.claude', 'commands', 'pr-create.md')).toBe(true);

      await removeAction({ type: 'cmd', slugOrRef: 'pr-create' });

      expect(testFileExists('.claude', 'commands', 'pr-create.md')).toBe(false);
      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps?.cmds ?? {}).not.toHaveProperty('pr-create');
      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps?.cmds ?? {}).not.toHaveProperty('pr-create');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('aipkg.json'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('aipkg.lock'));
    });

    it('removes a skill directory recursively', async () => {
      await seedSkill({
        slug: 'pr-helper',
        ref: 'skill/org443/pr-helper',
        version: '0.1.0',
      });

      await removeAction({ type: 'skill', slugOrRef: 'pr-helper' });

      expect(testFileExists('.claude', 'skills', 'pr-helper')).toBe(false);
      expect(testFileExists('.claude', 'skills', 'pr-helper', 'SKILL.md')).toBe(false);
      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps?.skills ?? {}).not.toHaveProperty('pr-helper');
      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps?.skills ?? {}).not.toHaveProperty('pr-helper');
    });

    it('accepts a full ref and strips it down to the slug', async () => {
      await seedCmd({ slug: 'pr-create', ref: 'cmd/org443/pr-create', version: 'latest' });

      await removeAction({ type: 'cmd', slugOrRef: 'org443/pr-create' });

      expect(testFileExists('.claude', 'commands', 'pr-create.md')).toBe(false);
      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps?.cmds ?? {}).not.toHaveProperty('pr-create');
    });
  });

  describe('partial state', () => {
    it('removes from manifest even when lockfile entry is missing', async () => {
      const parent = {
        type: 'box',
        ref: 'test/app',
        version: '0.0.0',
        deps: { cmds: { 'pr-create': 'aipkg://cmd/org443/pr-create@latest' } },
      };
      await writeTestFile(JSON.stringify(parent), 'aipkg.json');
      await writeTestFile(`# pr-create`, '.claude', 'commands', 'pr-create.md');

      await removeAction({ type: 'cmd', slugOrRef: 'pr-create' });

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps?.cmds ?? {}).not.toHaveProperty('pr-create');
      expect(testFileExists('.claude', 'commands', 'pr-create.md')).toBe(false);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed'));
    });

    it('logs "Nothing to remove" when nothing is tracked', async () => {
      await removeAction({ type: 'cmd', slugOrRef: 'missing' });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Nothing to remove'));
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Removed'));
    });
  });

  describe('validation', () => {
    it('throws on an invalid name', async () => {
      await expect(removeAction({ type: 'cmd', slugOrRef: 'bad name!' })).rejects.toThrow('Invalid name');
    });

    it('throws when the ref strips to an empty name', async () => {
      await expect(removeAction({ type: 'cmd', slugOrRef: '/' })).rejects.toThrow('Invalid name');
    });
  });
});

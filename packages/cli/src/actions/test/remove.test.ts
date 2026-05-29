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
  describe('statusLine', () => {
    it('clears the statusLine from settings when the owning hook is removed', async () => {
      const aipkgRef = 'aipkg://hook/org443/lint@1.0.0';
      await writeTestFile(
        JSON.stringify({
          type: 'box',
          ref: 'test/app',
          version: '0.0.0',
          deps: { hooks: { 'org443/lint': aipkgRef } },
        }),
        'aipkg.json',
      );
      await writeTestFile(
        JSON.stringify({
          deps: {
            hooks: { 'org443/lint': { aipkgRef, version: '1.0.0', sha: 'sha256:x' } },
            statusLine: { slug: 'org443/lint', statusLine: { command: 'status.sh' } },
          },
        }),
        'aipkg.lock',
      );
      await writeTestFile(
        JSON.stringify({ statusLine: { command: 'status.sh', __aipkg: 'org443/lint' } }),
        '.claude',
        'settings.local.json',
      );

      await removeAction({ type: 'hook', ref: 'org443/lint' });

      const settings = await readTestJson('.claude', 'settings.local.json');
      expect(settings.statusLine).toBeUndefined();

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps?.statusLine).toBeUndefined();
    });
  });

  describe('happy path', () => {
    it('removes a cmd from disk, manifest, and lockfile', async () => {
      await seedCmd({
        slug: 'pr-create',
        ref: 'cmd/org443/pr-create',
        version: 'latest',
      });

      expect(testFileExists('.claude', 'commands', 'pr-create.md')).toBe(true);

      await removeAction({ type: 'cmd', ref: 'org443/pr-create' });

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

      await removeAction({ type: 'skill', ref: 'org443/pr-helper' });

      expect(testFileExists('.claude', 'skills', 'pr-helper')).toBe(false);
      expect(testFileExists('.claude', 'skills', 'pr-helper', 'SKILL.md')).toBe(false);
      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps?.skills ?? {}).not.toHaveProperty('pr-helper');
      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps?.skills ?? {}).not.toHaveProperty('pr-helper');
    });

    it('removes a cmd addressed by its org/slug ref', async () => {
      await seedCmd({ slug: 'pr-create', ref: 'cmd/org443/pr-create', version: 'latest' });

      await removeAction({ type: 'cmd', ref: 'org443/pr-create' });

      expect(testFileExists('.claude', 'commands', 'pr-create.md')).toBe(false);
      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps?.cmds ?? {}).not.toHaveProperty('pr-create');
    });

    it('removes a ref-keyed hook by its full ref', async () => {
      const aipkgRef = 'aipkg://hook/superpowers/Superpowers@1.0.0';
      await writeTestFile(
        JSON.stringify({
          type: 'box',
          ref: 'test/app',
          version: '0.0.0',
          deps: { hooks: { 'superpowers/Superpowers': aipkgRef } },
        }),
        'aipkg.json',
      );
      await writeTestFile(
        JSON.stringify({
          deps: { hooks: { 'superpowers/Superpowers': { aipkgRef, version: '1.0.0', sha: 'sha256:x' } } },
        }),
        'aipkg.lock',
      );
      await writeTestFile(
        JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [], __aipkg: 'superpowers/Superpowers' }] } }),
        '.claude',
        'settings.local.json',
      );
      await writeTestFile('#!/bin/sh\n', '.claude', 'hooks', 'superpowers', 'Superpowers', 'scripts', 'run.sh');

      await removeAction({ type: 'hook', ref: 'superpowers/Superpowers' });

      expect(testFileExists('.claude', 'hooks', 'superpowers', 'Superpowers')).toBe(false);
      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps?.hooks ?? {}).not.toHaveProperty('superpowers/Superpowers');
      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps?.hooks ?? {}).not.toHaveProperty('superpowers/Superpowers');
      const settings = await readTestJson('.claude', 'settings.local.json');
      expect(settings.hooks).toBeUndefined();
    });
  });

  describe('box', () => {
    it('removes every child the box placed plus its own manifest/lockfile entries', async () => {
      const boxRef = 'aipkg://box/test/app@1.0.0';
      await writeTestFile(
        JSON.stringify({
          type: 'box',
          ref: 'test/myproject',
          version: '0.0.0',
          deps: { boxes: { 'test/app': boxRef } },
        }),
        'aipkg.json',
      );
      await writeTestFile(
        JSON.stringify({
          deps: {
            boxes: { 'test/app': { aipkgRef: boxRef, version: '1.0.0', sha: 'sha256:box' } },
            cmds: { greet: { aipkgRef: boxRef, version: '1.0.0', sha: 'sha256:box', parent: boxRef } },
            skills: { helper: { aipkgRef: boxRef, version: '1.0.0', sha: 'sha256:box', parent: boxRef } },
            hooks: { 'test/app': { aipkgRef: boxRef, version: '1.0.0', sha: 'sha256:box', parent: boxRef } },
          },
        }),
        'aipkg.lock',
      );
      await writeTestFile('# greet', '.claude', 'commands', 'greet.md');
      const skillDir = testDir('.claude', 'skills', 'helper');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '# skill');
      await writeTestFile('#!/bin/sh\n', '.claude', 'hooks', 'test', 'app', 'run.sh');

      await removeAction({ type: 'box', ref: 'test/app' });

      expect(testFileExists('.claude', 'commands', 'greet.md')).toBe(false);
      expect(testFileExists('.claude', 'skills', 'helper')).toBe(false);
      expect(testFileExists('.claude', 'hooks', 'test', 'app')).toBe(false);

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps?.boxes ?? {}).not.toHaveProperty('test/app');

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps?.boxes ?? {}).not.toHaveProperty('test/app');
      expect(lockfile.deps?.cmds ?? {}).not.toHaveProperty('greet');
      expect(lockfile.deps?.skills ?? {}).not.toHaveProperty('helper');
      expect(lockfile.deps?.hooks ?? {}).not.toHaveProperty('test/app');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed'));
    });
  });

  describe('cascading deps', () => {
    it('removes a non-box entry plus the transitive deps it pulled in', async () => {
      const parentRef = 'aipkg://cmd/org443/parent-cmd@1.0.0';
      const childRef = 'aipkg://skill/org443/child-skill@1.0.0';
      await writeTestFile(
        JSON.stringify({
          type: 'box',
          ref: 'test/myproject',
          version: '0.0.0',
          deps: { cmds: { 'parent-cmd': parentRef } },
        }),
        'aipkg.json',
      );
      await writeTestFile(
        JSON.stringify({
          deps: {
            cmds: { 'parent-cmd': { aipkgRef: parentRef, version: '1.0.0', sha: 'sha256:p' } },
            skills: {
              'child-skill': { aipkgRef: childRef, version: '1.0.0', sha: 'sha256:c', parent: parentRef },
            },
          },
        }),
        'aipkg.lock',
      );
      await writeTestFile('# parent', '.claude', 'commands', 'parent-cmd.md');
      const skillDir = testDir('.claude', 'skills', 'child-skill');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '# skill');

      await removeAction({ type: 'cmd', ref: 'org443/parent-cmd' });

      expect(testFileExists('.claude', 'commands', 'parent-cmd.md')).toBe(false);
      expect(testFileExists('.claude', 'skills', 'child-skill')).toBe(false);

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps?.cmds ?? {}).not.toHaveProperty('parent-cmd');

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps?.cmds ?? {}).not.toHaveProperty('parent-cmd');
      expect(lockfile.deps?.skills ?? {}).not.toHaveProperty('child-skill');
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

      await removeAction({ type: 'cmd', ref: 'org443/pr-create' });

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps?.cmds ?? {}).not.toHaveProperty('pr-create');
      expect(testFileExists('.claude', 'commands', 'pr-create.md')).toBe(false);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed'));
    });

    it('logs "Nothing to remove" when nothing is tracked', async () => {
      await removeAction({ type: 'cmd', ref: 'org443/missing' });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Nothing to remove'));
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Removed'));
    });
  });

  describe('validation', () => {
    it('throws on a ref with invalid characters', async () => {
      await expect(removeAction({ type: 'cmd', ref: 'org443/bad name!' })).rejects.toThrow('Invalid package reference');
    });

    it('throws on a ref missing the org segment', async () => {
      await expect(removeAction({ type: 'cmd', ref: 'pr-create' })).rejects.toThrow('Invalid package reference');
    });
  });
});

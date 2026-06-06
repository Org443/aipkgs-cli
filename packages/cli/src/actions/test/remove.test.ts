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

async function seedRule(args: { slug: string; ref: string; version: string; sha?: string }) {
  const { slug, ref, version, sha = 'sha256:abc' } = args;
  const aipkgRef = `aipkg://${ref}@${version === 'latest' ? 'latest' : version}`;
  const parent = {
    type: 'box',
    ref: 'test/app',
    version: '0.0.0',
    deps: { rules: { [slug]: aipkgRef } },
  };
  await writeTestFile(JSON.stringify(parent), 'aipkg.json');
  await writeTestFile(JSON.stringify({ deps: { rules: { [slug]: { aipkgRef, version, sha } } } }), 'aipkg.lock');
  await writeTestFile(`# ${slug}`, '.claude', 'rules', `${slug}.md`);
  return { aipkgRef };
}

describe('removeAction', () => {
  describe('.aipkgs mirror', () => {
    it('removes the package mirror alongside the placed asset', async () => {
      await seedRule({ slug: 'pr-create', ref: 'rule/org443/pr-create', version: 'latest' });
      await writeTestFile('# pr-create', '.aipkgs', 'rules', 'org443', 'pr-create', 'pr-create.md');
      await writeTestFile('{}', '.aipkgs', 'rules', 'org443', 'pr-create', 'aipkg.json');

      await removeAction({ type: 'rule', ref: 'org443/pr-create' });

      expect(testFileExists('.aipkgs', 'rules', 'org443', 'pr-create')).toBe(false);
    });
  });

  describe('cascading deps', () => {
    it('removes a non-box entry plus the transitive deps it pulled in', async () => {
      const parentRef = 'aipkg://rule/org443/parent-cmd@1.0.0';
      const childRef = 'aipkg://skill/org443/child-skill@1.0.0';
      await writeTestFile(
        JSON.stringify({
          type: 'box',
          ref: 'test/myproject',
          version: '0.0.0',
          deps: { rules: { 'parent-cmd': parentRef } },
        }),
        'aipkg.json',
      );
      await writeTestFile(
        JSON.stringify({
          deps: {
            rules: { 'parent-cmd': { aipkgRef: parentRef, version: '1.0.0', sha: 'sha256:p' } },
            skills: {
              'child-skill': { aipkgRef: childRef, version: '1.0.0', sha: 'sha256:c', parent: parentRef },
            },
          },
        }),
        'aipkg.lock',
      );
      await writeTestFile('# parent', '.claude', 'rules', 'parent-cmd.md');
      const skillDir = testDir('.claude', 'skills', 'child-skill');
      await mkdir(skillDir, { recursive: true });
      await writeFile(join(skillDir, 'SKILL.md'), '# skill');

      await removeAction({ type: 'rule', ref: 'org443/parent-cmd' });

      expect(testFileExists('.claude', 'rules', 'parent-cmd.md')).toBe(false);
      expect(testFileExists('.claude', 'skills', 'child-skill')).toBe(false);

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps?.rules ?? {}).not.toHaveProperty('parent-cmd');

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps?.rules ?? {}).not.toHaveProperty('parent-cmd');
      expect(lockfile.deps?.skills ?? {}).not.toHaveProperty('child-skill');
    });
  });

  describe('partial state', () => {
    it('removes from manifest even when lockfile entry is missing', async () => {
      const parent = {
        type: 'box',
        ref: 'test/app',
        version: '0.0.0',
        deps: { rules: { 'pr-create': 'aipkg://rule/org443/pr-create@latest' } },
      };
      await writeTestFile(JSON.stringify(parent), 'aipkg.json');
      await writeTestFile(`# pr-create`, '.claude', 'rules', 'pr-create.md');

      await removeAction({ type: 'rule', ref: 'org443/pr-create' });

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps?.rules ?? {}).not.toHaveProperty('pr-create');
      expect(testFileExists('.claude', 'rules', 'pr-create.md')).toBe(false);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed'));
    });

    it('logs "Nothing to remove" when nothing is tracked', async () => {
      await removeAction({ type: 'rule', ref: 'org443/missing' });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Nothing to remove'));
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('Removed'));
    });
  });

  describe('validation', () => {
    it('throws on a ref with invalid characters', async () => {
      await expect(removeAction({ type: 'rule', ref: 'org443/bad name!' })).rejects.toThrow(
        'Invalid package reference',
      );
    });

    it('throws on a ref missing the org segment', async () => {
      await expect(removeAction({ type: 'rule', ref: 'pr-create' })).rejects.toThrow('Invalid package reference');
    });
  });
});

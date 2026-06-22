import { join } from 'node:path';
import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTestFile, setupTestCwd, teardownTestCwd, testFileExists, testFileMode } from '../../../../test/helpers.ts';
import { installSkill } from '../skill.ts';

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

// Run the raw tar entries through archiveService.assert so each test installs from
// exactly the decoded skill a real skill archive carries.
function asserted(files: TarEntry[]) {
  const manifest = new Manifest({ type: 'skill', ref: 'acme/pr-helper', version: '1.0.0' });
  const { skills } = archiveService.assert({ manifest, files });
  // biome-ignore lint/style/noNonNullAssertion: a skill archive always decodes to one skill
  return skills[0]!;
}

beforeEach(() => setupTestCwd({ prefix: 'aipkg-open-std-skill-' }));
afterEach(teardownTestCwd);

describe('installSkill', () => {
  it('writes SKILL.md and nested assets under .agents/skills/<slug>/, preserving the tree', async () => {
    const skill = asserted([
      file('aipkg.json'),
      file('SKILL.md', '# pr-helper'),
      file('assets/diagram.txt', 'drawing'),
      file('references/guide.md', '# guide'),
    ]);

    const { written } = await installSkill({ skill });

    expect(await readTestFile('.agents/skills/pr-helper/SKILL.md')).toBe('# pr-helper');
    expect(await readTestFile('.agents/skills/pr-helper/assets/diagram.txt')).toBe('drawing');
    expect(await readTestFile('.agents/skills/pr-helper/references/guide.md')).toBe('# guide');
    expect(written).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\.agents\/skills\/pr-helper\/SKILL\.md$/),
        expect.stringMatching(/\.agents\/skills\/pr-helper\/assets\/diagram\.txt$/),
      ]),
    );
  });

  it('rewrites ${PKG_ROOT} in SKILL.md to the absolute .agents/skills/<slug> dir', async () => {
    const skill = asserted([
      file('aipkg.json'),
      file('SKILL.md', 'Run ${PKG_ROOT}/scripts/build.sh from ${PKG_ROOT}.'),
    ]);

    await installSkill({ skill });

    const installDir = join(process.cwd(), '.agents', 'skills', 'pr-helper');
    expect(await readTestFile('.agents/skills/pr-helper/SKILL.md')).toBe(
      `Run ${installDir}/scripts/build.sh from ${installDir}.`,
    );
  });

  it('places assets marked executable with the execute bit set', async () => {
    const skill = asserted([
      file('aipkg.json'),
      file('SKILL.md', '# pr-helper'),
      { path: 'scripts/build.sh', body: Buffer.from('#!/bin/sh\n'), executable: true },
      file('assets/diagram.txt', 'drawing'),
    ]);

    await installSkill({ skill });

    expect(await testFileMode('.agents/skills/pr-helper/scripts/build.sh')).toBe(0o755);
    expect(await testFileMode('.agents/skills/pr-helper/assets/diagram.txt')).toBe(0o644);
  });

  it('prunes cruft and does not place the aipkg.json manifest inside the skill', async () => {
    const skill = asserted([
      file('aipkg.json'),
      file('SKILL.md', '# pr-helper'),
      file('.DS_Store', 'junk'),
      file('node_modules/dep/index.js', 'x'),
    ]);

    await installSkill({ skill });

    expect(testFileExists('.agents/skills/pr-helper/SKILL.md')).toBe(true);
    expect(testFileExists('.agents/skills/pr-helper/.DS_Store')).toBe(false);
    expect(testFileExists('.agents/skills/pr-helper/node_modules')).toBe(false);
    // The manifest is package metadata, not a skill asset — it must not be placed.
    expect(testFileExists('.agents/skills/pr-helper/aipkg.json')).toBe(false);
  });
});

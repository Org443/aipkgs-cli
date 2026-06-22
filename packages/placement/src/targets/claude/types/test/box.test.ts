import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTestFile, setupTestCwd, teardownTestCwd, testFileExists, testFileMode } from '../../../../test/helpers.ts';
import { installBox } from '../box.ts';

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

const HOOKS_JSON = JSON.stringify({
  PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/lint.sh' }] }],
});

// Run the raw tar entries through archiveService.assert so each test installs from
// exactly the decoded children a real box archive carries.
function asserted(args: { ref: string; files: TarEntry[] }) {
  const manifest = new Manifest({ type: 'box', ref: args.ref, version: '1.0.0' });
  const decoded = archiveService.assert({ manifest, files: args.files });
  return { pkgRef: manifest.pkgRef, ...decoded };
}

beforeEach(() => setupTestCwd({ prefix: 'aipkg-claude-box-' }));
afterEach(teardownTestCwd);

describe('installBox', () => {
  it('fans flat rules and subagents into .claude/rules and .claude/agents', async () => {
    const { pkgRef, rules, subagents, skills, setup } = asserted({
      ref: 'acme/mega',
      files: [file('aipkg.json'), file('rules/style.md', '# style'), file('subagents/researcher.md', '# researcher')],
    });

    await installBox({ rules, subagents, skills, setup, pkgRef });

    expect(await readTestFile('.claude/rules/style.md')).toBe('# style');
    expect(await readTestFile('.claude/agents/researcher.md')).toBe('# researcher');
  });

  it('fans a skill subtree into .claude/skills/<slug>/, preserving nested assets', async () => {
    const { pkgRef, rules, subagents, skills, setup } = asserted({
      ref: 'acme/mega',
      files: [
        file('aipkg.json'),
        file('skills/foo/SKILL.md', '# foo'),
        file('skills/foo/assets/diagram.txt', 'drawing'),
      ],
    });

    await installBox({ rules, subagents, skills, setup, pkgRef });

    expect(await readTestFile('.claude/skills/foo/SKILL.md')).toBe('# foo');
    expect(await readTestFile('.claude/skills/foo/assets/diagram.txt')).toBe('drawing');
  });

  it('keeps the execute bit on a bundled skill asset through the box re-rooting', async () => {
    const { pkgRef, rules, subagents, skills, setup } = asserted({
      ref: 'acme/mega',
      files: [
        file('aipkg.json'),
        file('skills/foo/SKILL.md', '# foo'),
        { path: 'skills/foo/scripts/build.sh', body: Buffer.from('#!/bin/sh\n'), executable: true },
      ],
    });

    await installBox({ rules, subagents, skills, setup, pkgRef });

    expect(await testFileMode('.claude/skills/foo/scripts/build.sh')).toBe(0o755);
  });

  it('namespaces the setup script bundle under .claude/scripts/<box-ref>/, keyed by the box', async () => {
    const { pkgRef, rules, subagents, skills, setup } = asserted({
      ref: 'acme/mega',
      files: [file('aipkg.json'), file('setup.json', HOOKS_JSON), file('scripts/lint.sh', '#!/bin/sh\n')],
    });

    await installBox({ rules, subagents, skills, setup, pkgRef });

    expect(await readTestFile('.claude/scripts/acme/mega/scripts/lint.sh')).toBe('#!/bin/sh\n');
    // setup.json is consumed for settings, not dropped into the scripts dir as a raw asset.
    expect(testFileExists('.claude/scripts/acme/mega/setup.json')).toBe(false);
  });

  it('places real children while pruning cruft and never placing the box manifest', async () => {
    const { pkgRef, rules, subagents, skills, setup } = asserted({
      ref: 'acme/mega',
      files: [file('aipkg.json'), file('rules/style.md', '# style'), file('.DS_Store', 'junk')],
    });

    await installBox({ rules, subagents, skills, setup, pkgRef });

    expect(await readTestFile('.claude/rules/style.md')).toBe('# style');
    expect(testFileExists('.claude/rules/.DS_Store')).toBe(false);
    expect(testFileExists('.claude/rules/aipkg.json')).toBe(false);
  });
});

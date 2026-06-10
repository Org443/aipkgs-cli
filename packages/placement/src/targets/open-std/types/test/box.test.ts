import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTestFile, setupTestCwd, teardownTestCwd, testFileExists } from '../../../../test/helpers.ts';
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

beforeEach(() => setupTestCwd({ prefix: 'aipkg-open-std-box-' }));
afterEach(teardownTestCwd);

describe('installBox', () => {
  it('fans flat rules and subagents into .agents/rules and .agents/agents', async () => {
    const { pkgRef, rules, subagents, skills, setup } = asserted({
      ref: 'acme/mega',
      files: [file('aipkg.json'), file('rules/style.md', '# style'), file('subagents/researcher.md', '# researcher')],
    });

    await installBox({ rules, subagents, skills, setup, pkgRef });

    expect(await readTestFile('.agents/rules/style.md')).toBe('# style');
    expect(await readTestFile('.agents/agents/researcher.md')).toBe('# researcher');
  });

  it('fans a skill subtree into .agents/skills/<slug>/, preserving nested assets', async () => {
    const { pkgRef, rules, subagents, skills, setup } = asserted({
      ref: 'acme/mega',
      files: [
        file('aipkg.json'),
        file('skills/foo/SKILL.md', '# foo'),
        file('skills/foo/assets/diagram.txt', 'drawing'),
      ],
    });

    await installBox({ rules, subagents, skills, setup, pkgRef });

    expect(await readTestFile('.agents/skills/foo/SKILL.md')).toBe('# foo');
    expect(await readTestFile('.agents/skills/foo/assets/diagram.txt')).toBe('drawing');
  });

  it('namespaces the setup script bundle under .agents/scripts/<box-ref>/, keyed by the box', async () => {
    const { pkgRef, rules, subagents, skills, setup } = asserted({
      ref: 'acme/mega',
      files: [file('aipkg.json'), file('setup.json', HOOKS_JSON), file('scripts/lint.sh', '#!/bin/sh\n')],
    });

    await installBox({ rules, subagents, skills, setup, pkgRef });

    expect(await readTestFile('.agents/scripts/acme/mega/scripts/lint.sh')).toBe('#!/bin/sh\n');
    // setup.json is consumed for settings, not dropped into the scripts dir as a raw asset.
    expect(testFileExists('.agents/scripts/acme/mega/setup.json')).toBe(false);
  });

  it('places real children while pruning cruft and never placing the box manifest', async () => {
    const { pkgRef, rules, subagents, skills, setup } = asserted({
      ref: 'acme/mega',
      files: [file('aipkg.json'), file('rules/style.md', '# style'), file('.DS_Store', 'junk')],
    });

    await installBox({ rules, subagents, skills, setup, pkgRef });

    expect(await readTestFile('.agents/rules/style.md')).toBe('# style');
    expect(testFileExists('.agents/rules/.DS_Store')).toBe(false);
    expect(testFileExists('.agents/rules/aipkg.json')).toBe(false);
  });
});

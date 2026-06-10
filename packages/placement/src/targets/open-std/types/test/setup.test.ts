import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTestFile, setupTestCwd, teardownTestCwd, testFileExists } from '../../../../test/helpers.ts';
import { installSetup } from '../setup.ts';

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

const SETUP_JSON = JSON.stringify({
  PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/lint.sh' }] }],
});

// Run the raw tar entries through archiveService.assert so each test installs from
// exactly the decoded setup bundle a real setup archive carries.
function asserted(args: { ref: string; files: TarEntry[] }) {
  const manifest = new Manifest({ type: 'setup', ref: args.ref, version: '1.0.0' });
  const { setup } = archiveService.assert({ manifest, files: args.files });
  // biome-ignore lint/style/noNonNullAssertion: a setup archive always decodes to a setup bundle
  return { pkgRef: manifest.pkgRef, setup: setup! };
}

beforeEach(() => setupTestCwd({ prefix: 'aipkg-open-std-setup-' }));
afterEach(teardownTestCwd);

describe('installSetup', () => {
  it('namespaces script assets under .agents/scripts/<org>/<slug>/', async () => {
    const { pkgRef, setup } = asserted({
      ref: 'acme/lint',
      files: [file('aipkg.json'), file('setup.json', SETUP_JSON), file('scripts/lint.sh', '#!/bin/sh\n')],
    });

    const { written } = await installSetup({ setup, pkgRef });

    expect(await readTestFile('.agents/scripts/acme/lint/scripts/lint.sh')).toBe('#!/bin/sh\n');
    expect(written).toEqual(
      expect.arrayContaining([expect.stringMatching(/\.agents\/scripts\/acme\/lint\/scripts\/lint\.sh$/)]),
    );
  });

  it('keys the on-disk directory by the full org/key/slug ref', async () => {
    const { pkgRef, setup } = asserted({
      ref: 'superpowers/team/lint',
      files: [file('aipkg.json'), file('setup.json', SETUP_JSON), file('scripts/lint.sh', '#!/bin/sh\n')],
    });

    await installSetup({ setup, pkgRef });

    expect(testFileExists('.agents/scripts/superpowers/team/lint/scripts/lint.sh')).toBe(true);
  });

  it('does not place the aipkg.json manifest or setup.json in the hook directory', async () => {
    const { pkgRef, setup } = asserted({
      ref: 'acme/lint',
      files: [file('aipkg.json'), file('setup.json', SETUP_JSON), file('scripts/lint.sh', '#!/bin/sh\n')],
    });

    await installSetup({ setup, pkgRef });

    // The manifest and setup.json are package metadata, not hook assets — they must not be placed.
    expect(testFileExists('.agents/scripts/acme/lint/aipkg.json')).toBe(false);
    expect(testFileExists('.agents/scripts/acme/lint/setup.json')).toBe(false);
  });

  it('does not create scripts/<ref> when the bundle ships no scripts', async () => {
    const { pkgRef, setup } = asserted({
      ref: 'acme/lint',
      files: [file('aipkg.json'), file('setup.json', SETUP_JSON)],
    });

    await installSetup({ setup, pkgRef });

    // A hooks-only setup has no payload — leave no empty directory behind.
    expect(testFileExists('.agents/scripts/acme/lint')).toBe(false);
  });
});

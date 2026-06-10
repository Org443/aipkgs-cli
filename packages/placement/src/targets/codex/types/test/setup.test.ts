import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { parse } from 'smol-toml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTestFile, readTestJson, setupTestCwd, teardownTestCwd, testFileExists } from '../../../../test/helpers.ts';
import { installSetup, removeSetup } from '../setup.ts';

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

const HOOKS_JSON = JSON.stringify({
  PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '${PKG_ROOT}/scripts/lint.sh' }] }],
});

function asserted(args: { ref: string; files: TarEntry[] }) {
  const manifest = new Manifest({ type: 'setup', ref: args.ref, version: '1.0.0' });
  const { setup } = archiveService.assert({ manifest, files: args.files });
  // biome-ignore lint/style/noNonNullAssertion: a setup archive always decodes to a setup bundle
  return { pkgRef: manifest.pkgRef, setup: setup! };
}

async function readToml(path: string) {
  return parse(await readTestFile(path)) as Record<string, any>;
}

beforeEach(() => setupTestCwd({ prefix: 'aipkg-codex-setup-' }));
afterEach(teardownTestCwd);

describe('installSetup', () => {
  it('namespaces scripts under .codex/scripts/<ref>/ and merges hooks into .codex/hooks.json', async () => {
    const { pkgRef, setup } = asserted({
      ref: 'acme/lint',
      files: [file('aipkg.json'), file('setup.json', HOOKS_JSON), file('scripts/lint.sh', '#!/bin/sh\n')],
    });

    const { written } = await installSetup({ setup, pkgRef });

    expect(await readTestFile('.codex/scripts/acme/lint/scripts/lint.sh')).toBe('#!/bin/sh\n');
    expect(written).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\.codex\/scripts\/acme\/lint\/scripts\/lint\.sh$/),
        expect.stringMatching(/\.codex\/hooks\.json$/),
      ]),
    );

    const hooks = await readTestJson('.codex', 'hooks.json');
    // ${PKG_ROOT} is rewritten to the install dir; the matcher is owner-tagged.
    expect(hooks.hooks.PreToolUse[0]).toMatchObject({ matcher: 'Bash', __aipkg: 'acme/lint' });
    expect(hooks.hooks.PreToolUse[0].hooks[0].command).toBe('.codex/scripts/acme/lint/scripts/lint.sh');
  });

  it('writes MCP servers into .codex/config.toml with a sidecar ownership ledger', async () => {
    const setupJson = JSON.stringify({
      hooks: {},
      mcps: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] } },
    });
    const { pkgRef, setup } = asserted({
      ref: 'acme/tools',
      files: [file('aipkg.json'), file('setup.json', setupJson)],
    });

    const { written } = await installSetup({ setup, pkgRef });

    expect(written).toEqual(expect.arrayContaining([expect.stringMatching(/\.codex\/config\.toml$/)]));
    const config = await readToml('.codex/config.toml');
    // The table is schema-clean — no __aipkg tag (Codex rejects unknown fields).
    expect(config.mcp_servers.context7).toEqual({ command: 'npx', args: ['-y', '@upstash/context7-mcp'] });
    const ledger = await readTestJson('.codex', 'aipkg-mcp.json');
    expect(ledger).toEqual({ context7: 'acme/tools' });
  });

  it('logs and skips a bundled status line (no Codex equivalent)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setupJson = JSON.stringify({
      hooks: {},
      statusLine: { type: 'command', command: '${PKG_ROOT}/scripts/status.sh' },
    });
    const { pkgRef, setup } = asserted({
      ref: 'acme/lint',
      files: [file('aipkg.json'), file('setup.json', setupJson), file('scripts/status.sh', '#!/bin/sh\n')],
    });

    await installSetup({ setup, pkgRef });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('status line not supported'));
    warn.mockRestore();
  });
});

describe('removeSetup', () => {
  it('deletes the script dir, strips owned hooks, and removes owned MCP servers', async () => {
    const setupJson = JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/lint.sh' }] }] },
      mcps: { context7: { command: 'npx' } },
    });
    const { pkgRef, setup } = asserted({
      ref: 'acme/tools',
      files: [file('aipkg.json'), file('setup.json', setupJson), file('scripts/lint.sh', '#!/bin/sh\n')],
    });
    await installSetup({ setup, pkgRef });

    const { removed } = await removeSetup({ ref: 'acme/tools' });

    expect(removed).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\.codex\/scripts\/acme\/tools$/),
        expect.stringMatching(/\.codex\/config\.toml$/),
      ]),
    );
    expect(testFileExists('.codex/scripts/acme/tools')).toBe(false);
    const hooks = await readTestJson('.codex', 'hooks.json');
    expect(hooks.hooks).toBeUndefined();
    const config = await readToml('.codex/config.toml');
    expect(config.mcp_servers).toBeUndefined();
    // The ledger is deleted once empty.
    expect(testFileExists('.codex/aipkg-mcp.json')).toBe(false);
  });
});

import { join } from 'node:path';
import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { describe, expect, it } from 'vitest';
import { readTestFile, readTestJson, testFileExists, writeTestFile } from '../../test/helpers.ts';
import { installAction } from '../install/install.ts';
import { removeAction } from '../remove.ts';
import { mockArchiveFetch, useE2EWorld } from './e2e-harness.ts';

useE2EWorld({ prefix: 'aipkg-setup-e2e-' });

// A fully populated setup bundle: hooks (with a `${PKG_ROOT}` script reference),
// a statusLine (also `${PKG_ROOT}`-anchored), and two MCP servers — one HTTP,
// one stdio — plus the script payload the hooks invoke.
function defaultSetupFiles(): TarEntry[] {
  return [
    {
      path: 'setup.json',
      body: Buffer.from(
        JSON.stringify({
          hooks: {
            PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '${PKG_ROOT}/scripts/lint.sh' }] }],
          },
          statusLine: { type: 'command', command: '${PKG_ROOT}/status.sh' },
          mcps: {
            linear: { url: 'https://mcp.linear.app/sse' },
            'local-tools': { command: 'node', args: ['server.js'], env: { TOKEN: 'secret' } },
          },
        }),
      ),
    },
    { path: 'scripts/lint.sh', body: Buffer.from('#!/bin/sh\necho lint\n') },
    { path: 'status.sh', body: Buffer.from('#!/bin/sh\necho status\n') },
  ];
}

async function buildSetupTarball(args: { ref: string; version: string; files?: TarEntry[] }) {
  const { ref, version, files } = args;
  const manifest = new Manifest({ type: 'setup', ref, version, targets: ['claude'] });
  const { tgz } = await archiveService.pack({ manifest, files: files ?? defaultSetupFiles() });
  return tgz;
}

const SETUP_REF = 'org443/default';
const SETUP_VERSION = '1.0.0';
// The install dir `${PKG_ROOT}` resolves to for an `org443/default` setup.
const INSTALL_DIR = join('.claude', 'scripts', 'org443', 'default');

// Build the `org443/default` setup bundle and route fetch to it. Returns the
// parsed archive so callers can assert on the recorded SHA, plus the fetch spy
// for URL assertions.
async function seedRegistry() {
  const tarball = await buildSetupTarball({ ref: SETUP_REF, version: SETUP_VERSION });
  const archive = await archiveService.parse(tarball);
  const fetchSpy = mockArchiveFetch(tarball);
  return { archive, fetchSpy };
}

describe('aipkg setup org443/default — install', () => {
  it('places hooks, statusLine, and MCP servers from a populated setup.json', async () => {
    // ARRANGE
    const { archive: expectedArchive, fetchSpy } = await seedRegistry();

    // ACT: aipkg setup org443/default
    await installAction({ type: 'setup', ref: SETUP_REF });

    // ASSERT
    // Scripts land under the bundle's install dir, preserving tarball structure.
    expect(await readTestFile('.claude', 'scripts', 'org443', 'default', 'scripts', 'lint.sh')).toBe(
      '#!/bin/sh\necho lint\n',
    );
    expect(await readTestFile('.claude', 'scripts', 'org443', 'default', 'status.sh')).toBe('#!/bin/sh\necho status\n');
    // setup.json itself is config, not a placed payload file.
    expect(testFileExists('.claude', 'scripts', 'org443', 'default', 'setup.json')).toBe(false);

    // Hooks merge into settings with `${PKG_ROOT}` resolved and an ownership tag.
    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0]).toMatchObject({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: `${INSTALL_DIR}/scripts/lint.sh` }],
      __aipkg: 'org443/default',
    });

    // statusLine merges in with `${PKG_ROOT}` resolved and the same ownership tag.
    expect(settings.statusLine).toMatchObject({
      type: 'command',
      command: `${INSTALL_DIR}/status.sh`,
      __aipkg: 'org443/default',
    });

    // MCP servers land in .mcp.json: a `url` becomes an http server, a `command`
    // becomes a stdio server. Both carry the owner tag so remove can find them.
    const mcp = await readTestJson('.mcp.json');
    expect(mcp.mcpServers[`${SETUP_REF}/linear`]).toMatchObject({
      type: 'http',
      url: 'https://mcp.linear.app/sse',
      __aipkg: 'org443/default',
    });
    expect(mcp.mcpServers[`${SETUP_REF}/local-tools`]).toMatchObject({
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      env: { TOKEN: 'secret' },
      __aipkg: 'org443/default',
    });

    // Manifest and lockfile track the bundle by its full ref.
    const manifest = await readTestJson('aipkg.json');
    expect(manifest.deps.setups).toMatchObject({ 'org443/default': 'aipkg://setup/org443/default@latest' });

    const lockfile = await readTestJson('aipkg.lock');
    expect(lockfile.deps.setups).toMatchObject({
      'org443/default': {
        aipkgRef: 'aipkg://setup/org443/default@1.0.0',
        version: '1.0.0',
        sha: expectedArchive.sha,
      },
    });
    // The lockfile records the bundle's raw statusLine; `${PKG_ROOT}` is only
    // resolved when written into settings.local.json, not when locked.
    expect(lockfile.deps.statusLine).toMatchObject({
      slug: 'org443/default',
      statusLine: { command: '${PKG_ROOT}/status.sh' },
    });

    // biome-ignore lint/style/noNonNullAssertion: test assertion
    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('/v1/packages/setup/org443/default/latest/archive.tgz');
  });
});

describe('aipkg setup org443/default — install then remove (round-trip)', () => {
  it('reverses every side effect of the install', async () => {
    // ARRANGE
    await seedRegistry();

    // ACT: aipkg setup org443/default
    await installAction({ type: 'setup', ref: SETUP_REF });

    // Sanity: the install actually wrote everything before we tear it down.
    expect(testFileExists('.claude', 'scripts', 'org443', 'default', 'scripts', 'lint.sh')).toBe(true);
    expect(Object.keys((await readTestJson('.mcp.json')).mcpServers).sort()).toEqual([
      `${SETUP_REF}/linear`,
      `${SETUP_REF}/local-tools`,
    ]);

    // ACT: aipkg remove setup org443/default
    await removeAction({ type: 'setup', ref: SETUP_REF });

    // ASSERT
    // Script payload dir is gone.
    expect(testFileExists('.claude', 'scripts', 'org443', 'default')).toBe(false);

    // Hooks and statusLine cleared from settings.
    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks).toBeUndefined();
    expect(settings.statusLine).toBeUndefined();

    // Both MCP servers removed from .mcp.json.
    const mcp = await readTestJson('.mcp.json');
    expect(mcp.mcpServers).not.toHaveProperty(`${SETUP_REF}/linear`);
    expect(mcp.mcpServers).not.toHaveProperty(`${SETUP_REF}/local-tools`);

    // Manifest and lockfile entries (including the tracked statusLine) cleared.
    const manifest = await readTestJson('aipkg.json');
    expect(manifest.deps?.setups ?? {}).not.toHaveProperty('org443/default');

    const lockfile = await readTestJson('aipkg.lock');
    expect(lockfile.deps?.setups ?? {}).not.toHaveProperty('org443/default');
    expect(lockfile.deps?.statusLine).toBeUndefined();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed'));
  });

  it('leaves an unrelated MCP server in place when removing a setup', async () => {
    // ARRANGE
    // A server the user added by hand (no owner tag) must survive the setup remove.
    await writeTestFile(
      JSON.stringify({ mcpServers: { 'user-server': { type: 'http', url: 'https://user.example' } } }),
      '.mcp.json',
    );
    await seedRegistry();

    // ACT: aipkg setup org443/default, then aipkg remove setup org443/default
    await installAction({ type: 'setup', ref: SETUP_REF });
    await removeAction({ type: 'setup', ref: SETUP_REF });

    // ASSERT
    const mcp = await readTestJson('.mcp.json');
    expect(mcp.mcpServers).not.toHaveProperty(`${SETUP_REF}/linear`);
    expect(mcp.mcpServers).not.toHaveProperty(`${SETUP_REF}/local-tools`);
    expect(mcp.mcpServers['user-server']).toMatchObject({ type: 'http', url: 'https://user.example' });
  });
});

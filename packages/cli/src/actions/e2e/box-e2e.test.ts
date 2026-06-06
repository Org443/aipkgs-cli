import { join } from 'node:path';
import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { describe, expect, it } from 'vitest';
import { readTestFile, readTestJson, testFileExists, writeTestFile } from '../../test/helpers.ts';
import { installAction } from '../install/install.ts';
import { removeAction } from '../remove.ts';
import { mockArchiveFetch, useE2EWorld } from './harness.ts';

useE2EWorld({ prefix: 'aipkg-box-e2e-' });

const BOX_REF = 'org443/dx';
const BOX_VERSION = '1.0.0';
// The install dir `${PKG_ROOT}` resolves to for the box's bundled setup.
const INSTALL_DIR = join('.claude', 'scripts', 'org443', 'dx');

// A fully-loaded box: a flat rule, a flat subagent, a nested skill subtree, and a
// bundled setup carrying hooks, a statusLine, and an MCP server (all anchored on
// `${PKG_ROOT}`, with the scripts they invoke under `scripts/`).
function defaultBoxFiles(): TarEntry[] {
  return [
    { path: 'rules/style.md', body: Buffer.from('# style\nHouse style.\n') },
    { path: 'subagents/researcher.md', body: Buffer.from('# researcher\nDeep research agent.\n') },
    { path: 'skills/deploy/SKILL.md', body: Buffer.from('# deploy\nShip it.\n') },
    { path: 'skills/deploy/references/runbook.md', body: Buffer.from('# runbook\n') },
    {
      path: 'setup.json',
      body: Buffer.from(
        JSON.stringify({
          hooks: {
            PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '${PKG_ROOT}/scripts/lint.sh' }] }],
          },
          statusLine: { type: 'command', command: '${PKG_ROOT}/scripts/status.sh' },
          mcps: {
            linear: { url: 'https://mcp.linear.app/sse' },
          },
        }),
      ),
    },
    { path: 'scripts/lint.sh', body: Buffer.from('#!/bin/sh\necho lint\n') },
    { path: 'scripts/status.sh', body: Buffer.from('#!/bin/sh\necho status\n') },
  ];
}

async function buildBoxTarball(args: { ref: string; version: string; files?: TarEntry[] }) {
  const { ref, version, files } = args;
  const manifest = new Manifest({ type: 'box', ref, version, targets: ['claude'] });
  const { tgz } = await archiveService.pack({ manifest, files: files ?? defaultBoxFiles() });
  return tgz;
}

// Build the `org443/dx` box and route fetch to it. Returns the parsed archive so
// callers can assert on the recorded SHA, plus the fetch spy for URL assertions.
async function seedRegistry() {
  const tarball = await buildBoxTarball({ ref: BOX_REF, version: BOX_VERSION });
  const archive = await archiveService.parse(tarball);
  const fetchSpy = mockArchiveFetch(tarball);
  return { archive, fetchSpy };
}

describe('aipkg box org443/dx — install', () => {
  it('fans every bundled child out into its Claude location and applies the setup', async () => {
    // ARRANGE
    const { archive: expectedArchive, fetchSpy } = await seedRegistry();

    // ACT: aipkg box org443/dx
    await installAction({ type: 'box', ref: BOX_REF });

    // ASSERT
    // The flat rule and subagent land in their flat directories.
    expect(await readTestFile('.claude', 'rules', 'style.md')).toBe('# style\nHouse style.\n');
    expect(await readTestFile('.claude', 'agents', 'researcher.md')).toBe('# researcher\nDeep research agent.\n');

    // The skill subtree lands under `.claude/skills/<slug>`, preserving its assets.
    expect(await readTestFile('.claude', 'skills', 'deploy', 'SKILL.md')).toBe('# deploy\nShip it.\n');
    expect(await readTestFile('.claude', 'skills', 'deploy', 'references', 'runbook.md')).toBe('# runbook\n');

    // The bundled setup's scripts land under the box's install dir.
    expect(await readTestFile('.claude', 'scripts', 'org443', 'dx', 'scripts', 'lint.sh')).toBe(
      '#!/bin/sh\necho lint\n',
    );

    // Hooks and statusLine merge into settings with `${PKG_ROOT}` resolved against
    // the box's install dir and the box ref as the ownership tag.
    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks.PreToolUse[0]).toMatchObject({
      matcher: 'Bash',
      hooks: [{ type: 'command', command: `${INSTALL_DIR}/scripts/lint.sh` }],
      __aipkg: 'org443/dx',
    });
    expect(settings.statusLine).toMatchObject({
      type: 'command',
      command: `${INSTALL_DIR}/scripts/status.sh`,
      __aipkg: 'org443/dx',
    });

    // The MCP server lands in .mcp.json, namespaced by the box ref and owner-tagged.
    const mcp = await readTestJson('.mcp.json');
    expect(mcp.mcpServers[`${BOX_REF}/linear`]).toMatchObject({
      type: 'http',
      url: 'https://mcp.linear.app/sse',
      __aipkg: 'org443/dx',
    });

    // The manifest tracks the box by its full ref, pinned at @latest.
    const manifest = await readTestJson('aipkg.json');
    expect(manifest.deps.boxes).toMatchObject({ 'org443/dx': 'aipkg://box/org443/dx@latest' });

    // The lockfile pins the box itself, plus a child entry per bundled asset.
    const lockfile = await readTestJson('aipkg.lock');
    expect(lockfile.deps.boxes).toMatchObject({
      'org443/dx': { aipkgRef: 'aipkg://box/org443/dx@1.0.0', version: '1.0.0', sha: expectedArchive.sha },
    });
    expect(lockfile.deps.rules).toHaveProperty('style');
    expect(lockfile.deps.subagents).toHaveProperty('researcher');
    expect(lockfile.deps.skills).toHaveProperty('deploy');

    // The archive was downloaded once, at @latest.
    // biome-ignore lint/style/noNonNullAssertion: test assertion
    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('/v1/packages/box/org443/dx/latest/archive.tgz');
  });
});

describe('aipkg box org443/dx — install then remove (round-trip)', () => {
  it('reverses every bundled child and setup side effect', async () => {
    // ARRANGE
    await seedRegistry();

    // ACT: aipkg box org443/dx
    await installAction({ type: 'box', ref: BOX_REF });

    // Sanity: the install actually wrote everything before we tear it down.
    expect(testFileExists('.claude', 'rules', 'style.md')).toBe(true);
    expect(testFileExists('.claude', 'agents', 'researcher.md')).toBe(true);
    expect(testFileExists('.claude', 'skills', 'deploy', 'SKILL.md')).toBe(true);

    // ACT: aipkg remove box org443/dx
    await removeAction({ type: 'box', ref: BOX_REF });

    // ASSERT
    // Every bundled child is gone.
    expect(testFileExists('.claude', 'rules', 'style.md')).toBe(false);
    expect(testFileExists('.claude', 'agents', 'researcher.md')).toBe(false);
    expect(testFileExists('.claude', 'skills', 'deploy')).toBe(false);

    // The setup script payload dir is gone.
    expect(testFileExists('.claude', 'scripts', 'org443', 'dx')).toBe(false);

    // Hooks and statusLine cleared from settings.
    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks).toBeUndefined();
    expect(settings.statusLine).toBeUndefined();

    // The MCP server removed from .mcp.json.
    const mcp = await readTestJson('.mcp.json');
    expect(mcp.mcpServers).not.toHaveProperty(`${BOX_REF}/linear`);

    // Manifest and lockfile entries (box and every child) cleared.
    const manifest = await readTestJson('aipkg.json');
    expect(manifest.deps?.boxes ?? {}).not.toHaveProperty('org443/dx');

    const lockfile = await readTestJson('aipkg.lock');
    expect(lockfile.deps?.boxes ?? {}).not.toHaveProperty('org443/dx');
    expect(lockfile.deps?.rules ?? {}).not.toHaveProperty('style');
    expect(lockfile.deps?.subagents ?? {}).not.toHaveProperty('researcher');
    expect(lockfile.deps?.skills ?? {}).not.toHaveProperty('deploy');
    expect(lockfile.deps?.statusLine).toBeUndefined();

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed'));
  });
});

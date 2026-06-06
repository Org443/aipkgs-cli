import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigFile } from '../../../files/config.ts';
import {
  EMPTY_LOCKFILE,
  EMPTY_MANIFEST,
  readTestFile,
  readTestJson,
  setupTestCwd,
  teardownTestCwd,
  testFileExists,
  writeTestFile,
} from '../../../test/helpers.ts';
import { installAction } from '../install.ts';

let home = '';
let originalHome: string | undefined;

beforeEach(async () => {
  setupTestCwd({ prefix: 'aipkg-install-test-' });
  // Isolate HOME so the suite reads a fresh config (mirror off) instead of the
  // dev's real ~/.aipkg/config.json; the mirror tests opt in via ConfigFile.
  home = mkdtempSync(join(tmpdir(), 'aipkg-install-home-'));
  originalHome = process.env.HOME;
  process.env.HOME = home;
  process.env.AIPKG_API = 'http://test.invalid';
  process.env.AIPKG_TARGET = 'claude';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await writeTestFile(EMPTY_MANIFEST, 'aipkg.json');
  await writeTestFile(EMPTY_LOCKFILE, 'aipkg.lock');
});

afterEach(() => {
  teardownTestCwd();
  vi.restoreAllMocks();
  process.env.HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
  process.env.AIPKG_API = undefined;
  process.env.AIPKG_TARGET = undefined;
});

async function buildTestTarball(args: {
  type: 'skill' | 'subagent' | 'rule' | 'box' | 'setup';
  org: string;
  key?: string;
  slug: string;
  version: string;
  files?: TarEntry[];
}) {
  const { type, org, key, slug, version, files } = args;
  const ref = key ? `${org}/${key}/${slug}` : `${org}/${slug}`;
  const manifest = new Manifest({ type, ref, version, targets: ['claude'] });
  const defaultFiles: TarEntry[] = [{ path: `${slug}.md`, body: Buffer.from(`# ${slug}\nTest content.`) }];
  const { tgz } = await archiveService.pack({ manifest, files: files ?? defaultFiles });
  return tgz;
}

function mockFetch(tarball: Buffer) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(tarball, { status: 200, headers: { 'Content-Type': 'application/gzip' } }),
  );
}

describe('installAction', () => {
  describe('happy path', () => {
    it('installs a rule package end-to-end', async () => {
      const tarball = await buildTestTarball({ type: 'rule', org: 'org443', slug: 'pr-create', version: '1.0.0' });
      const expectedArchive = await archiveService.parse(tarball);
      mockFetch(tarball);

      //aipkg rule org443/pr-create
      await installAction({ type: 'rule', ref: 'org443/pr-create' });

      const content = await readTestFile('.claude', 'rules', 'pr-create.md');
      expect(content).toBe('# pr-create\nTest content.');

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps.rules).toMatchObject({
        'pr-create': 'aipkg://rule/org443/pr-create@latest',
      });

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps.rules).toMatchObject({
        'pr-create': {
          aipkgRef: 'aipkg://rule/org443/pr-create@1.0.0',
          version: '1.0.0',
          sha: expectedArchive.sha,
        },
      });

      expect(globalThis.fetch).toHaveBeenCalledOnce();
      // biome-ignore lint/style/noNonNullAssertion: test assertion
      const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/v1/packages/rule/org443/pr-create/latest/archive.tgz');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Installed'));
    });

    it('installs a keyed ref (org/key/slug) without version', async () => {
      const tarball = await buildTestTarball({
        type: 'rule',
        org: 'org443',
        key: 'core',
        slug: 'pr-create',
        version: '2.0.0',
      });
      const expectedArchive = await archiveService.parse(tarball);
      mockFetch(tarball);

      //aipkg rule org443/core/pr-create
      await installAction({ type: 'rule', ref: 'org443/core/pr-create' });

      const content = await readTestFile('.claude', 'rules', 'pr-create.md');
      expect(content).toBe('# pr-create\nTest content.');

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps.rules).toMatchObject({
        'pr-create': 'aipkg://rule/org443/core/pr-create@latest',
      });

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps.rules).toMatchObject({
        'pr-create': {
          aipkgRef: 'aipkg://rule/org443/core/pr-create@2.0.0',
          version: '2.0.0',
          sha: expectedArchive.sha,
        },
      });

      // biome-ignore lint/style/noNonNullAssertion: test assertion
      const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/v1/packages/rule/org443/core/pr-create/latest/archive.tgz');
    });

    it('installs a pinned version (org/slug@version)', async () => {
      const tarball = await buildTestTarball({ type: 'rule', org: 'org443', slug: 'pr-create', version: '1.1.1' });
      const expectedArchive = await archiveService.parse(tarball);
      mockFetch(tarball);

      //aipkg rule org443/pr-create@1.1.1
      await installAction({ type: 'rule', ref: 'org443/pr-create@1.1.1' });

      const content = await readTestFile('.claude', 'rules', 'pr-create.md');
      expect(content).toBe('# pr-create\nTest content.');

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps.rules).toMatchObject({
        'pr-create': 'aipkg://rule/org443/pr-create@1.1.1',
      });

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps.rules).toMatchObject({
        'pr-create': {
          aipkgRef: 'aipkg://rule/org443/pr-create@1.1.1',
          version: '1.1.1',
          sha: expectedArchive.sha,
        },
      });

      // biome-ignore lint/style/noNonNullAssertion: test assertion
      const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/v1/packages/rule/org443/pr-create/1.1.1/archive.tgz');
    });
  });

  describe('box with setup', () => {
    it('extracts the root setup.json + scripts/ into a single bundle keyed by the box ref', async () => {
      const tarball = await buildTestTarball({
        type: 'box',
        org: 'org443',
        slug: 'my-box',
        version: '1.0.0',
        files: [
          {
            path: 'setup.json',
            body: Buffer.from(
              '{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"scripts/lint.sh"}]}]}',
            ),
          },
          { path: 'scripts/lint.sh', body: Buffer.from('#!/bin/sh\necho lint\n') },
          { path: 'rules/pr-create.md', body: Buffer.from('# pr-create') },
        ],
      });
      mockFetch(tarball);

      //aipkg box org443/my-box
      await installAction({ type: 'box', ref: 'org443/my-box' });

      expect(await readTestFile('.claude', 'scripts', 'org443', 'my-box', 'scripts', 'lint.sh')).toBe(
        '#!/bin/sh\necho lint\n',
      );
      expect(testFileExists('.claude', 'scripts', 'org443', 'my-box', 'setup.json')).toBe(false);
      expect(testFileExists('.claude', 'scripts', 'scripts')).toBe(false);

      const settings = await readTestJson('.claude', 'settings.local.json');
      expect(settings.hooks.PreToolUse).toHaveLength(1);
      expect(settings.hooks.PreToolUse[0]).toMatchObject({
        matcher: 'Bash',
        hooks: [{ type: 'command', command: 'scripts/lint.sh' }],
        __aipkg: 'org443/my-box',
      });

      expect(await readTestFile('.claude', 'rules', 'pr-create.md')).toBe('# pr-create');
    });

    it('locks and writes a statusLine carried by a box setup bundle', async () => {
      const tarball = await buildTestTarball({
        type: 'box',
        org: 'org443',
        slug: 'my-box',
        version: '1.0.0',
        files: [
          {
            path: 'setup.json',
            body: Buffer.from(
              JSON.stringify({
                hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/lint.sh' }] }] },
                statusLine: { type: 'command', command: 'box-status.sh' },
              }),
            ),
          },
          { path: 'scripts/lint.sh', body: Buffer.from('#!/bin/sh\n') },
        ],
      });
      mockFetch(tarball);

      await installAction({ type: 'box', ref: 'org443/my-box' });

      const settings = await readTestJson('.claude', 'settings.local.json');
      expect(settings.statusLine).toMatchObject({ command: 'box-status.sh', __aipkg: 'org443/my-box' });

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps.statusLine).toMatchObject({
        slug: 'org443/my-box',
        statusLine: { command: 'box-status.sh' },
      });
    });
  });

  describe('setup ref keying', () => {
    it('keys the manifest, lockfile, and on-disk dir by the full ref', async () => {
      const tarball = await buildTestTarball({
        type: 'setup',
        org: 'superpowers',
        slug: 'Superpowers',
        version: '1.0.0',
        files: [
          {
            path: 'setup.json',
            body: Buffer.from(
              '{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"scripts/lint.sh"}]}]}',
            ),
          },
          { path: 'scripts/lint.sh', body: Buffer.from('#!/bin/sh\n') },
        ],
      });
      const expectedArchive = await archiveService.parse(tarball);
      mockFetch(tarball);

      await installAction({ type: 'setup', ref: 'superpowers/Superpowers' });

      expect(await readTestFile('.claude', 'scripts', 'superpowers', 'Superpowers', 'scripts', 'lint.sh')).toBe(
        '#!/bin/sh\n',
      );

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps.setups).toMatchObject({
        'superpowers/Superpowers': 'aipkg://setup/superpowers/Superpowers@latest',
      });

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps.setups).toMatchObject({
        'superpowers/Superpowers': {
          aipkgRef: 'aipkg://setup/superpowers/Superpowers@1.0.0',
          version: '1.0.0',
          sha: expectedArchive.sha,
        },
      });
    });

    it('keys a box by its full ref in the manifest and lockfile', async () => {
      const tarball = await buildTestTarball({
        type: 'box',
        org: 'superpowers',
        slug: 'Superpowers',
        version: '1.0.0',
        files: [{ path: 'rules/pr-create.md', body: Buffer.from('# pr-create') }],
      });
      const expectedArchive = await archiveService.parse(tarball);
      mockFetch(tarball);

      await installAction({ type: 'box', ref: 'superpowers/Superpowers' });

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps.boxes).toMatchObject({
        'superpowers/Superpowers': 'aipkg://box/superpowers/Superpowers@latest',
      });

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps.boxes).toMatchObject({
        'superpowers/Superpowers': {
          aipkgRef: 'aipkg://box/superpowers/Superpowers@1.0.0',
          version: '1.0.0',
          sha: expectedArchive.sha,
        },
      });
    });
  });

  describe('setup with statusLine', () => {
    function setupFiles(statusCommand: string): TarEntry[] {
      return [
        {
          path: 'setup.json',
          body: Buffer.from(
            JSON.stringify({
              hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/lint.sh' }] }] },
              statusLine: { type: 'command', command: statusCommand },
            }),
          ),
        },
        { path: 'scripts/lint.sh', body: Buffer.from('#!/bin/sh\n') },
      ];
    }

    it('writes the statusLine to settings and locks it', async () => {
      const tarball = await buildTestTarball({
        type: 'setup',
        org: 'org443',
        slug: 'lint',
        version: '1.0.0',
        files: setupFiles('status.sh'),
      });
      mockFetch(tarball);

      await installAction({ type: 'setup', ref: 'org443/lint' });

      const settings = await readTestJson('.claude', 'settings.local.json');
      expect(settings.statusLine).toMatchObject({ type: 'command', command: 'status.sh', __aipkg: 'org443/lint' });

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps.statusLine).toMatchObject({ slug: 'org443/lint', statusLine: { command: 'status.sh' } });
    });

    it('throws a conflict when a second setup bundle defines a statusLine', async () => {
      const lintTar = await buildTestTarball({
        type: 'setup',
        org: 'org443',
        slug: 'lint',
        version: '1.0.0',
        files: setupFiles('status-a.sh'),
      });
      mockFetch(lintTar);
      await installAction({ type: 'setup', ref: 'org443/lint' });

      const fmtTar = await buildTestTarball({
        type: 'setup',
        org: 'org443',
        slug: 'fmt',
        version: '1.0.0',
        files: setupFiles('status-b.sh'),
      });
      mockFetch(fmtTar);

      await expect(installAction({ type: 'setup', ref: 'org443/fmt' })).rejects.toThrow(/statusLine conflict/);
    });
  });

  describe('idempotent re-install', () => {
    it('succeeds when lockfile SHA matches', async () => {
      const tarball = await buildTestTarball({ type: 'rule', org: 'org443', slug: 'pr-create', version: '1.0.0' });
      const expectedArchive = await archiveService.parse(tarball);
      mockFetch(tarball);

      await writeTestFile(
        JSON.stringify({
          deps: {
            rules: {
              'pr-create': {
                aipkgRef: 'aipkg://rule/org443/pr-create@latest',
                version: '1.0.0',
                sha: expectedArchive.sha,
              },
            },
          },
        }),
        'aipkg.lock',
      );

      await installAction({ type: 'rule', ref: 'org443/pr-create' });

      const content = await readTestFile('.claude', 'rules', 'pr-create.md');
      expect(content).toBe('# pr-create\nTest content.');
    });
  });

  describe('upgrade', () => {
    it('replaces a stale lock entry when the user installs a different version', async () => {
      const tarball = await buildTestTarball({ type: 'rule', org: 'org443', slug: 'pr-create', version: '0.2.0' });
      const expectedArchive = await archiveService.parse(tarball);
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(tarball, { status: 200, headers: { 'Content-Type': 'application/gzip' } }));

      // Lock pins an older version with a different SHA — this would normally
      // trip the SHA-mismatch guard if the upgrade path didn't clear it first.
      await writeTestFile(
        JSON.stringify({
          deps: {
            rules: {
              'pr-create': {
                aipkgRef: 'aipkg://rule/org443/pr-create@0.1.0',
                version: '0.1.0',
                sha: 'sha256:stale',
              },
            },
          },
        }),
        'aipkg.lock',
      );

      await installAction({ type: 'rule', ref: 'org443/pr-create@0.2.0' });

      // biome-ignore lint/style/noNonNullAssertion: test assertion
      const calledUrl = vi.mocked(fetchSpy).mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/v1/packages/rule/org443/pr-create/0.2.0/archive.tgz');

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps.rules['pr-create']).toMatchObject({
        aipkgRef: 'aipkg://rule/org443/pr-create@0.2.0',
        version: '0.2.0',
        sha: expectedArchive.sha,
      });
    });
  });

  describe('.aipkgs mirror', () => {
    it('mirrors the full archive into a namespaced .aipkgs dir when enabled', async () => {
      await ConfigFile.setAipkgsMirror('enabled');
      const tarball = await buildTestTarball({
        type: 'rule',
        org: 'org443',
        slug: 'code-simplify',
        version: '1.0.0',
        files: [
          { path: 'code-simplify.md', body: Buffer.from('# code-simplify') },
          { path: 'README.md', body: Buffer.from('# readme') },
        ],
      });
      mockFetch(tarball);

      await installAction({ type: 'rule', ref: 'org443/code-simplify' });

      const root = ['.aipkgs', 'rules', 'org443', 'code-simplify'];
      expect(await readTestFile(...root, 'code-simplify.md')).toBe('# code-simplify');
      expect(await readTestFile(...root, 'README.md')).toBe('# readme');
      // The manifest ships inside the mirror so the archive is fully reconstructed,
      // pretty-printed for readability on disk.
      const manifestRaw = await readTestFile(...root, 'aipkg.json');
      expect(manifestRaw).toBe(`${JSON.stringify(JSON.parse(manifestRaw), null, 2)}\n`);
      expect(JSON.parse(manifestRaw)).toMatchObject({ type: 'rule', ref: 'org443/code-simplify', version: '1.0.0' });
    });

    it('mirrors a box archive (children included) under .aipkgs/boxes', async () => {
      await ConfigFile.setAipkgsMirror('enabled');
      const tarball = await buildTestTarball({
        type: 'box',
        org: 'org443',
        slug: 'my-box',
        version: '1.0.0',
        files: [{ path: 'rules/pr-create.md', body: Buffer.from('# pr-create') }],
      });
      mockFetch(tarball);

      await installAction({ type: 'box', ref: 'org443/my-box' });

      expect(await readTestFile('.aipkgs', 'boxes', 'org443', 'my-box', 'rules', 'pr-create.md')).toBe('# pr-create');
    });

    it('does not create .aipkgs when the flag is off', async () => {
      const tarball = await buildTestTarball({ type: 'rule', org: 'org443', slug: 'pr-create', version: '1.0.0' });
      mockFetch(tarball);

      await installAction({ type: 'rule', ref: 'org443/pr-create' });

      expect(testFileExists('.aipkgs')).toBe(false);
    });
  });

  describe('network errors', () => {
    it('throws on HTTP 500', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

      await expect(installAction({ type: 'rule', ref: 'org443/pr-create' })).rejects.toThrow();
    });

    it('throws when fetch rejects', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

      await expect(installAction({ type: 'rule', ref: 'org443/pr-create' })).rejects.toThrow('fetch failed');
    });
  });
});

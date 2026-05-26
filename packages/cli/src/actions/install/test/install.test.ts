import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { installAction } from '../index.ts';

beforeEach(async () => {
  setupTestCwd({ prefix: 'aipkg-install-test-' });
  process.env.AIPKG_API = 'http://test.invalid';
  process.env.AIPKG_TARGET = 'claude';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await writeTestFile(EMPTY_MANIFEST, 'aipkg.json');
  await writeTestFile(EMPTY_LOCKFILE, 'aipkg.lock');
});

afterEach(() => {
  teardownTestCwd();
  vi.restoreAllMocks();
  process.env.AIPKG_API = undefined;
  process.env.AIPKG_TARGET = undefined;
});

async function buildTestTarball(args: {
  type: 'cmd' | 'skill' | 'subagent' | 'rule';
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
    it('installs a cmd package end-to-end', async () => {
      const tarball = await buildTestTarball({ type: 'cmd', org: 'org443', slug: 'pr-create', version: '1.0.0' });
      const expectedArchive = await archiveService.parse(tarball);
      mockFetch(tarball);

      await installAction({ type: 'cmd', ref: 'org443/pr-create' });

      const content = await readTestFile('.claude', 'commands', 'pr-create.md');
      expect(content).toBe('# pr-create\nTest content.');

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps.cmds).toMatchObject({
        'pr-create': 'aipkg://cmd/org443/pr-create@latest',
      });

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps.cmds).toMatchObject({
        'pr-create': {
          aipkgRef: 'aipkg://cmd/org443/pr-create@latest',
          version: '1.0.0',
          sha: expectedArchive.sha,
        },
      });

      expect(globalThis.fetch).toHaveBeenCalledOnce();
      // biome-ignore lint/style/noNonNullAssertion: test assertion
      const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/v1/packages/cmd/org443/pr-create/latest/archive.tgz');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Installed'));
    });

    it('installs a keyed ref (org/key/slug) without version', async () => {
      const tarball = await buildTestTarball({
        type: 'cmd',
        org: 'org443',
        key: 'core',
        slug: 'pr-create',
        version: '2.0.0',
      });
      const expectedArchive = await archiveService.parse(tarball);
      mockFetch(tarball);

      await installAction({ type: 'cmd', ref: 'org443/core/pr-create' });

      const content = await readTestFile('.claude', 'commands', 'pr-create.md');
      expect(content).toBe('# pr-create\nTest content.');

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps.cmds).toMatchObject({
        'pr-create': 'aipkg://cmd/org443/core/pr-create@latest',
      });

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps.cmds).toMatchObject({
        'pr-create': {
          aipkgRef: 'aipkg://cmd/org443/core/pr-create@latest',
          version: '2.0.0',
          sha: expectedArchive.sha,
        },
      });

      // biome-ignore lint/style/noNonNullAssertion: test assertion
      const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/v1/packages/cmd/org443/core/pr-create/latest/archive.tgz');
    });

    it('installs a pinned version (org/slug@version)', async () => {
      const tarball = await buildTestTarball({ type: 'cmd', org: 'org443', slug: 'pr-create', version: '1.1.1' });
      const expectedArchive = await archiveService.parse(tarball);
      mockFetch(tarball);

      await installAction({ type: 'cmd', ref: 'org443/pr-create@1.1.1' });

      const content = await readTestFile('.claude', 'commands', 'pr-create.md');
      expect(content).toBe('# pr-create\nTest content.');

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps.cmds).toMatchObject({
        'pr-create': 'aipkg://cmd/org443/pr-create@1.1.1',
      });

      const lockfile = await readTestJson('aipkg.lock');
      expect(lockfile.deps.cmds).toMatchObject({
        'pr-create': {
          aipkgRef: 'aipkg://cmd/org443/pr-create@1.1.1',
          version: '1.1.1',
          sha: expectedArchive.sha,
        },
      });

      // biome-ignore lint/style/noNonNullAssertion: test assertion
      const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/v1/packages/cmd/org443/pr-create/1.1.1/archive.tgz');
    });
  });

  describe('alias support', () => {
    it('installs under the alias name', async () => {
      const tarball = await buildTestTarball({ type: 'cmd', org: 'org443', slug: 'pr-create', version: '1.0.0' });
      mockFetch(tarball);

      await installAction({ type: 'cmd', ref: 'org443/pr-create', alias: 'my-pr' });

      const content = await readTestFile('.claude', 'commands', 'my-pr.md');
      expect(content).toBe('# pr-create\nTest content.');

      const manifest = await readTestJson('aipkg.json');
      expect(manifest.deps.cmds).toHaveProperty('my-pr');
      expect(manifest.deps.cmds).not.toHaveProperty('pr-create');
    });
  });

  describe('validation', () => {
    it('rejects an alias with invalid characters', async () => {
      await expect(installAction({ type: 'cmd', ref: 'org443/pr-create', alias: 'bad alias!' })).rejects.toThrow(
        'Invalid alias',
      );
    });
  });

  describe('SHA mismatch', () => {
    it('throws when lockfile SHA does not match downloaded archive', async () => {
      const tarball = await buildTestTarball({ type: 'cmd', org: 'org443', slug: 'pr-create', version: '1.0.0' });
      mockFetch(tarball);

      await writeTestFile(
        JSON.stringify({
          deps: {
            cmds: {
              'pr-create': {
                aipkgRef: 'aipkg://cmd/org443/pr-create@latest',
                version: '1.0.0',
                sha: 'sha256:wrong',
              },
            },
          },
        }),
        'aipkg.lock',
      );

      await expect(installAction({ type: 'cmd', ref: 'org443/pr-create' })).rejects.toThrow('SHA mismatch');

      expect(testFileExists('.claude', 'commands', 'pr-create.md')).toBe(false);
    });
  });

  describe('idempotent re-install', () => {
    it('succeeds when lockfile SHA matches', async () => {
      const tarball = await buildTestTarball({ type: 'cmd', org: 'org443', slug: 'pr-create', version: '1.0.0' });
      const expectedArchive = await archiveService.parse(tarball);
      mockFetch(tarball);

      await writeTestFile(
        JSON.stringify({
          deps: {
            cmds: {
              'pr-create': {
                aipkgRef: 'aipkg://cmd/org443/pr-create@latest',
                version: '1.0.0',
                sha: expectedArchive.sha,
              },
            },
          },
        }),
        'aipkg.lock',
      );

      await installAction({ type: 'cmd', ref: 'org443/pr-create' });

      const content = await readTestFile('.claude', 'commands', 'pr-create.md');
      expect(content).toBe('# pr-create\nTest content.');
    });
  });

  describe('network errors', () => {
    it('throws on HTTP 500', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

      await expect(installAction({ type: 'cmd', ref: 'org443/pr-create' })).rejects.toThrow();
    });

    it('throws when fetch rejects', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

      await expect(installAction({ type: 'cmd', ref: 'org443/pr-create' })).rejects.toThrow('fetch failed');
    });
  });
});

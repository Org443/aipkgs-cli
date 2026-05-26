import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readTestFile,
  readTestJson,
  setupTestCwd,
  teardownTestCwd,
  testFileExists,
  writeTestFile,
} from '../../../test/helpers.ts';
import { installAllAction } from '../all.ts';

beforeEach(() => {
  setupTestCwd({ prefix: 'aipkg-install-all-test-' });
  process.env.AIPKG_API = 'http://test.invalid';
  process.env.AIPKG_TARGET = 'claude';
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  teardownTestCwd();
  vi.restoreAllMocks();
  process.env.AIPKG_API = undefined;
  process.env.AIPKG_TARGET = undefined;
});

async function buildTarball(args: { type: 'cmd'; org: string; slug: string; version: string }) {
  const { type, org, slug, version } = args;
  const manifest = new Manifest({ type, ref: `${org}/${slug}`, version, targets: ['claude'] });
  const files: TarEntry[] = [{ path: `${slug}.md`, body: Buffer.from(`# ${slug}\nbody`) }];
  const { tgz } = await archiveService.pack({ manifest, files });
  return tgz;
}

describe('installAllAction', () => {
  describe('--manifest option', () => {
    it('reads from the custom manifest and writes the paired lockfile', async () => {
      const tarball = await buildTarball({ type: 'cmd', org: 'org443', slug: 'pr-create', version: '1.0.0' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(tarball, { status: 200, headers: { 'Content-Type': 'application/gzip' } }),
      );

      await writeTestFile(
        JSON.stringify({
          type: 'box',
          ref: 'test/reviewer',
          version: '0.0.0',
          deps: { cmds: { 'pr-create': 'aipkg://cmd/org443/pr-create@1.0.0' } },
        }),
        'aipkg.reviewer.json',
      );

      await installAllAction({ manifest: 'aipkg.reviewer.json' });

      const content = await readTestFile('.claude', 'commands', 'pr-create.md');
      expect(content).toBe('# pr-create\nbody');

      const lockfile = await readTestJson('aipkg.reviewer.lock');
      expect(lockfile.deps.cmds).toMatchObject({
        'pr-create': { aipkgRef: 'aipkg://cmd/org443/pr-create@1.0.0', version: '1.0.0' },
      });

      expect(testFileExists('aipkg.lock')).toBe(false);
      expect(testFileExists('aipkg.json')).toBe(false);
    });

    it('defaults to aipkg.json/aipkg.lock when no manifest is provided', async () => {
      const tarball = await buildTarball({ type: 'cmd', org: 'org443', slug: 'pr-create', version: '1.0.0' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(tarball, { status: 200, headers: { 'Content-Type': 'application/gzip' } }),
      );

      await writeTestFile(
        JSON.stringify({
          type: 'box',
          ref: 'test/app',
          version: '0.0.0',
          deps: { cmds: { 'pr-create': 'aipkg://cmd/org443/pr-create@1.0.0' } },
        }),
        'aipkg.json',
      );

      await installAllAction();

      expect(testFileExists('aipkg.lock')).toBe(true);
      expect(testFileExists('aipkg.reviewer.lock')).toBe(false);
    });
  });
});

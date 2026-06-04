import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Lockfile } from '../../../files/lockfile.ts';
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
import { resolveDeps } from '../deps-resolution.ts';

beforeEach(async () => {
  setupTestCwd({ prefix: 'aipkg-resolve-deps-test-' });
  process.env.AIPKG_API = 'http://test.invalid';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await writeTestFile(EMPTY_MANIFEST, 'aipkg.json');
  await writeTestFile(EMPTY_LOCKFILE, 'aipkg.lock');
});

afterEach(() => {
  teardownTestCwd();
  vi.restoreAllMocks();
  process.env.AIPKG_API = undefined;
});

async function buildTarball(args: {
  type: 'cmd' | 'subagent' | 'rule';
  org: string;
  slug: string;
  version: string;
  files?: TarEntry[];
  deps?: {
    cmds?: Record<string, string>;
    subagents?: Record<string, string>;
    rules?: Record<string, string>;
    skills?: Record<string, string>;
    mcps?: Record<
      string,
      {
        url?: string;
        headers?: Record<string, string>;
        command?: string;
        args?: string[];
        env?: Record<string, string>;
      }
    >;
  };
}) {
  const { type, org, slug, version, files, deps } = args;
  const manifest = new Manifest({ type, ref: `${org}/${slug}`, version, targets: ['claude'], deps });
  const defaultFiles: TarEntry[] = [{ path: `${slug}.md`, body: Buffer.from(`# ${slug}\nTest content for ${slug}.`) }];
  const { tgz } = await archiveService.pack({ manifest, files: files ?? defaultFiles });
  return tgz;
}

describe('resolveDeps', () => {
  describe('happy path', () => {
    it('installs each dep declared in the parent archive manifest and populates the lockfile', async () => {
      const cmdTarball = await buildTarball({ type: 'cmd', org: 'org443', slug: 'pr-create', version: '1.0.0' });
      const cmdArchive = await archiveService.parse(cmdTarball);

      const subagentTarball = await buildTarball({
        type: 'subagent',
        org: 'org443',
        slug: 'reviewer',
        version: '2.0.0',
      });
      const subagentArchive = await archiveService.parse(subagentTarball);

      const ruleTarball = await buildTarball({ type: 'rule', org: 'org443', slug: 'no-any', version: '1.1.0' });
      const ruleArchive = await archiveService.parse(ruleTarball);

      const parentManifest = new Manifest({
        type: 'box',
        ref: 'org443/parent',
        version: '0.1.0',
        targets: ['claude'],
        deps: {
          cmds: { 'pr-create': 'aipkg://cmd/org443/pr-create@1.0.0' },
          subagents: { reviewer: 'aipkg://subagent/org443/reviewer@2.0.0' },
          rules: { 'no-any': 'aipkg://rule/org443/no-any@1.1.0' },
        },
      });
      const { tgz: parentTgz } = await archiveService.pack({ manifest: parentManifest, files: [] });
      const parentArchive = await archiveService.parse(parentTgz);

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/v1/packages/cmd/org443/pr-create/1.0.0/archive.tgz')) {
          return new Response(cmdTarball, { status: 200, headers: { 'Content-Type': 'application/gzip' } });
        }
        if (url.includes('/v1/packages/subagent/org443/reviewer/2.0.0/archive.tgz')) {
          return new Response(subagentTarball, { status: 200, headers: { 'Content-Type': 'application/gzip' } });
        }
        if (url.includes('/v1/packages/rule/org443/no-any/1.1.0/archive.tgz')) {
          return new Response(ruleTarball, { status: 200, headers: { 'Content-Type': 'application/gzip' } });
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const lockfile = await Lockfile.resolve();
      await resolveDeps({ archive: parentArchive, lockfile, targets: ['claude'] });
      await lockfile.write();

      // Each dep type is placed under its expected Claude directory.
      expect(await readTestFile('.claude', 'commands', 'pr-create.md')).toBe(
        '# pr-create\nTest content for pr-create.',
      );
      expect(await readTestFile('.claude', 'agents', 'reviewer.md')).toBe('# reviewer\nTest content for reviewer.');
      expect(await readTestFile('.claude', 'rules', 'no-any.md')).toBe('# no-any\nTest content for no-any.');

      expect(testFileExists('.claude', 'commands', 'pr-create.md')).toBe(true);
      expect(testFileExists('.claude', 'agents', 'reviewer.md')).toBe(true);
      expect(testFileExists('.claude', 'rules', 'no-any.md')).toBe(true);

      // Fetched each dep exactly once at the pinned version.
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);

      // Each dep is recorded in the lockfile under its asset-type bucket with
      // the version and SHA from the downloaded archive.
      const parentRef = parentArchive.pkgRef.aipkgRef;
      const cmdRef = cmdArchive.pkgRef.aipkgRef;
      const subagentRef = subagentArchive.pkgRef.aipkgRef;
      const ruleRef = ruleArchive.pkgRef.aipkgRef;

      const lockfileJson = await readTestJson('aipkg.lock');
      expect(lockfileJson.deps).toMatchObject({
        cmds: {
          'pr-create': { aipkgRef: cmdRef, version: '1.0.0', sha: cmdArchive.sha, parent: parentRef },
        },
        subagents: {
          reviewer: { aipkgRef: subagentRef, version: '2.0.0', sha: subagentArchive.sha, parent: parentRef },
        },
        rules: {
          'no-any': { aipkgRef: ruleRef, version: '1.1.0', sha: ruleArchive.sha, parent: parentRef },
        },
      });

      // And the in-memory instance the nested installPkg calls received is the
      // same one we wrote — proving the lockfile was threaded through the call
      // graph instead of each recursion re-reading the empty file from disk.
      expect(lockfile.deps).toMatchObject({
        cmds: {
          'pr-create': { aipkgRef: cmdRef, version: '1.0.0', sha: cmdArchive.sha, parent: parentRef },
        },
        subagents: {
          reviewer: { aipkgRef: subagentRef, version: '2.0.0', sha: subagentArchive.sha, parent: parentRef },
        },
        rules: {
          'no-any': { aipkgRef: ruleRef, version: '1.1.0', sha: ruleArchive.sha, parent: parentRef },
        },
      });
    });

    it('honors an existing lockfile entry whose SHA matches the downloaded dep', async () => {
      const cmdTarball = await buildTarball({ type: 'cmd', org: 'org443', slug: 'pr-create', version: '1.0.0' });
      const cmdArchive = await archiveService.parse(cmdTarball);

      const parentManifest = new Manifest({
        type: 'box',
        ref: 'org443/parent',
        version: '0.1.0',
        targets: ['claude'],
        deps: { cmds: { 'pr-create': 'aipkg://cmd/org443/pr-create@1.0.0' } },
      });
      const { tgz: parentTgz } = await archiveService.pack({ manifest: parentManifest, files: [] });
      const parentArchive = await archiveService.parse(parentTgz);

      // Pre-seed the lockfile with the matching SHA so the integrity check passes.
      await writeTestFile(
        JSON.stringify({
          deps: {
            cmds: {
              'pr-create': {
                aipkgRef: 'aipkg://cmd/org443/pr-create@1.0.0',
                version: '1.0.0',
                sha: cmdArchive.sha,
              },
            },
          },
        }),
        'aipkg.lock',
      );

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(cmdTarball, { status: 200, headers: { 'Content-Type': 'application/gzip' } }),
      );

      const lockfile = await Lockfile.resolve();
      await resolveDeps({ archive: parentArchive, lockfile, targets: ['claude'] });
      await lockfile.write();

      const cmdContent = await readTestFile('.claude', 'commands', 'pr-create.md');
      expect(cmdContent).toBe('# pr-create\nTest content for pr-create.');

      const lockfileJson = await readTestJson('aipkg.lock');
      expect(lockfileJson.deps.cmds['pr-create']).toMatchObject({ version: '1.0.0', sha: cmdArchive.sha });
    });

    it('installs MCP deps declared in the parent archive — writes .mcp.json and locks the entry', async () => {
      const parentManifest = new Manifest({
        type: 'box',
        ref: 'org443/parent',
        version: '0.1.0',
        targets: ['claude'],
        deps: {
          mcps: {
            linear: { url: 'https://mcp.linear.app/sse', headers: { Authorization: 'Bearer abc' } },
            git: { command: 'uvx', args: ['mcp-server-git'] },
          },
        },
      });
      const { tgz: parentTgz } = await archiveService.pack({ manifest: parentManifest, files: [] });
      const parentArchive = await archiveService.parse(parentTgz);

      const lockfile = await Lockfile.resolve();
      await resolveDeps({ archive: parentArchive, lockfile, targets: ['claude'] });
      await lockfile.write();

      const mcpJson = await readTestJson('.mcp.json');
      expect(mcpJson.mcpServers).toMatchObject({
        linear: { type: 'http', url: 'https://mcp.linear.app/sse', headers: { Authorization: 'Bearer abc' } },
        git: { type: 'stdio', command: 'uvx', args: ['mcp-server-git'] },
      });

      const parentRef = parentArchive.pkgRef.aipkgRef;
      const lockfileJson = await readTestJson('aipkg.lock');
      expect(lockfileJson.deps.mcps).toMatchObject({
        linear: { url: 'https://mcp.linear.app/sse', parent: parentRef },
        git: { command: 'uvx', args: ['mcp-server-git'], parent: parentRef },
      });
    });

    it('throws when two MCPs with the same name declare different configs', async () => {
      const parentManifest = new Manifest({
        type: 'box',
        ref: 'org443/parent',
        version: '0.1.0',
        targets: ['claude'],
        deps: { mcps: { linear: { url: 'https://mcp.linear.app/sse' } } },
      });
      const { tgz: parentTgz } = await archiveService.pack({ manifest: parentManifest, files: [] });
      const parentArchive = await archiveService.parse(parentTgz);

      const lockfile = await Lockfile.resolve();
      // pre-seed an mcp with a different url so the resolved one collides
      lockfile.upsertMcp({ slug: 'linear', entry: { url: 'https://other.example/sse' } });

      await expect(resolveDeps({ archive: parentArchive, lockfile, targets: ['claude'] })).rejects.toThrow(
        /mcps conflict/,
      );
    });

    it('downloads the locked version when the archive manifest pins a transitive dep at @latest', async () => {
      const ruleTarball = await buildTarball({ type: 'rule', org: 'org443', slug: 'no-any', version: '0.1.0' });
      const ruleArchive = await archiveService.parse(ruleTarball);

      // Parent archive declares the rule at @latest, but the lockfile pins it to @0.1.0.
      const parentManifest = new Manifest({
        type: 'box',
        ref: 'org443/parent',
        version: '0.1.0',
        targets: ['claude'],
        deps: { rules: { 'no-any': 'aipkg://rule/org443/no-any@latest' } },
      });
      const { tgz: parentTgz } = await archiveService.pack({ manifest: parentManifest, files: [] });
      const parentArchive = await archiveService.parse(parentTgz);

      await writeTestFile(
        JSON.stringify({
          deps: {
            rules: {
              'no-any': {
                aipkgRef: 'aipkg://rule/org443/no-any@0.1.0',
                version: '0.1.0',
                sha: ruleArchive.sha,
              },
            },
          },
        }),
        'aipkg.lock',
      );

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(ruleTarball, { status: 200, headers: { 'Content-Type': 'application/gzip' } }));

      const lockfile = await Lockfile.resolve();
      await resolveDeps({ archive: parentArchive, lockfile, targets: ['claude'] });

      // biome-ignore lint/style/noNonNullAssertion: test assertion
      const calledUrl = vi.mocked(fetchSpy).mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/v1/packages/rule/org443/no-any/0.1.0/archive.tgz');
      expect(calledUrl).not.toContain('/latest/');
    });

    it('recursively installs transitive deps and pins each entry to its immediate parent', async () => {
      // Leaf: a rule with no further deps.
      const ruleTarball = await buildTarball({ type: 'rule', org: 'org443', slug: 'no-any', version: '1.1.0' });
      const ruleArchive = await archiveService.parse(ruleTarball);

      // Middle: a cmd that depends on the rule above.
      const cmdTarball = await buildTarball({
        type: 'cmd',
        org: 'org443',
        slug: 'pr-create',
        version: '1.0.0',
        deps: { rules: { 'no-any': 'aipkg://rule/org443/no-any@1.1.0' } },
      });
      const cmdArchive = await archiveService.parse(cmdTarball);

      // Root: the parent archive depends only on the cmd.
      const parentManifest = new Manifest({
        type: 'box',
        ref: 'org443/parent',
        version: '0.1.0',
        targets: ['claude'],
        deps: { cmds: { 'pr-create': 'aipkg://cmd/org443/pr-create@1.0.0' } },
      });
      const { tgz: parentTgz } = await archiveService.pack({ manifest: parentManifest, files: [] });
      const parentArchive = await archiveService.parse(parentTgz);

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/v1/packages/cmd/org443/pr-create/1.0.0/archive.tgz')) {
          return new Response(cmdTarball, { status: 200, headers: { 'Content-Type': 'application/gzip' } });
        }
        if (url.includes('/v1/packages/rule/org443/no-any/1.1.0/archive.tgz')) {
          return new Response(ruleTarball, { status: 200, headers: { 'Content-Type': 'application/gzip' } });
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });

      const lockfile = await Lockfile.resolve();
      await resolveDeps({ archive: parentArchive, lockfile, targets: ['claude'] });
      await lockfile.write();

      // Both the direct dep and the transitive dep were placed on disk.
      expect(testFileExists('.claude', 'commands', 'pr-create.md')).toBe(true);
      expect(testFileExists('.claude', 'rules', 'no-any.md')).toBe(true);

      // Each archive was downloaded exactly once across the recursion.
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);

      const parentRef = parentArchive.pkgRef.aipkgRef;
      const cmdRef = cmdArchive.pkgRef.aipkgRef;

      // The transitive rule's parent is the cmd that pulled it in, NOT the root
      // — this is what proves the parent ref is the immediate importer.
      const ruleRef = ruleArchive.pkgRef.aipkgRef;

      const lockfileJson = await readTestJson('aipkg.lock');
      expect(lockfileJson.deps).toMatchObject({
        cmds: {
          'pr-create': { aipkgRef: cmdRef, version: '1.0.0', sha: cmdArchive.sha, parent: parentRef },
        },
        rules: {
          'no-any': { aipkgRef: ruleRef, version: '1.1.0', sha: ruleArchive.sha, parent: cmdRef },
        },
      });
    });
  });
});

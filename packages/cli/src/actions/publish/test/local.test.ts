import { type ManifestType, archiveService } from '@local/archive';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CredentialsFile } from '../../../files/credentials.ts';
import { setupTestCwd, teardownTestCwd, testDir, writeTestFile } from '../../../test/helpers.ts';
import { publishAction } from '../publish.ts';

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
vi.mock('../../../autocomplete/confirm.ts', () => ({ confirm: confirmMock }));

const originalIsTTY = process.stdout.isTTY;

beforeEach(async () => {
  setupTestCwd({ prefix: 'aipkg-publish-test-' });
  // Default to non-interactive so the upload path runs without a prompt; the
  // interactive tests flip this on explicitly.
  process.stdout.isTTY = false;
  process.env.AIPKG_API = 'http://test.invalid';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(CredentialsFile, 'resolve').mockResolvedValue({
    token: 'test-token',
    user: { id: 'u1', email: 'tester@example.com' },
    write: async () => {},
    delete: async () => {},
    toObject: () => ({ token: 'test-token' }),
  } as unknown as CredentialsFile);
});

afterEach(() => {
  teardownTestCwd();
  vi.restoreAllMocks();
  confirmMock.mockReset();
  process.stdout.isTTY = originalIsTTY;
  process.env.AIPKG_API = undefined;
});

function mockUpload(response: { path: string } = { path: 'rule/org443/pr-create/1.0.0' }) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
}

async function writePkgManifest(args: {
  dir: string[];
  type: ManifestType;
  ref: string;
  version: string;
  description?: string;
}) {
  const { dir, type, ref, version, description } = args;
  const manifest = { type, ref, version, ...(description ? { description } : {}) };
  await writeTestFile(JSON.stringify(manifest), ...dir, 'aipkg.json');
}

async function capturedUploadBody(fetchSpy: ReturnType<typeof mockUpload>): Promise<Buffer> {
  expect(fetchSpy).toHaveBeenCalledOnce();
  // biome-ignore lint/style/noNonNullAssertion: test assertion
  const init = fetchSpy.mock.calls[0]![1] as RequestInit;
  return Buffer.from(init.body as ArrayBuffer);
}

describe('publishAction', () => {
  describe('happy path', () => {
    it('publishes a rule from a directory containing aipkg.json + <slug>.md', async () => {
      const dir = ['rules', 'pr-create'];
      await writePkgManifest({
        dir,
        type: 'rule',
        ref: 'org443/pr-create',
        version: '1.0.0',
        description: 'Create a pull request',
      });
      await writeTestFile('# pr-create\nLocal content.', ...dir, 'pr-create.md');
      const fetchSpy = mockUpload();

      await publishAction({ path: testDir(...dir) });

      const tarball = await capturedUploadBody(fetchSpy);
      const archive = await archiveService.parse(tarball);
      expect(archive.manifest).toMatchObject({
        type: 'rule',
        ref: 'org443/pr-create',
        version: '1.0.0',
        description: 'Create a pull request',
      });
      const files = archive.files;
      const contentFiles = files.filter((f) => f.path !== 'aipkg.json');
      expect(contentFiles).toEqual([{ path: 'pr-create.md', body: Buffer.from('# pr-create\nLocal content.') }]);

      // biome-ignore lint/style/noNonNullAssertion: test assertion
      const calledUrl = fetchSpy.mock.calls[0]![0] as string;
      expect(calledUrl).toContain('/v1/publish');
      // biome-ignore lint/style/noNonNullAssertion: test assertion
      const init = fetchSpy.mock.calls[0]![1] as RequestInit;
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer test-token');
    });

    it('publishes a skill, packing every file in the directory', async () => {
      const dir = ['skills', 'pr-helper'];
      await writePkgManifest({
        dir,
        type: 'skill',
        ref: 'org443/pr-helper',
        version: '0.1.0',
      });
      await writeTestFile('# pr-helper\nSkill body.', ...dir, 'SKILL.md');
      await writeTestFile('docs', ...dir, 'README.md');
      await writeTestFile('asset bytes', ...dir, 'assets', 'logo.txt');
      const fetchSpy = mockUpload();

      await publishAction({ path: testDir(...dir) });

      const tarball = await capturedUploadBody(fetchSpy);
      const archive = await archiveService.parse(tarball);
      expect(archive.manifest).toMatchObject({
        type: 'skill',
        ref: 'org443/pr-helper',
        version: '0.1.0',
      });
      const files = archive.files;
      const paths = files
        .map((f) => f.path)
        .filter((p) => p !== 'aipkg.json')
        .sort();
      expect(paths).toEqual(['README.md', 'SKILL.md', 'assets/logo.txt']);
    });

    it('packs optional README.md sidecar for non-skill types', async () => {
      const dir = ['rules', 'safety'];
      await writePkgManifest({
        dir,
        type: 'rule',
        ref: 'org443/safety',
        version: '1.0.0',
      });
      await writeTestFile('# safety', ...dir, 'safety.md');
      await writeTestFile('# README', ...dir, 'README.md');
      const fetchSpy = mockUpload();

      await publishAction({ path: testDir(...dir) });

      const tarball = await capturedUploadBody(fetchSpy);
      const archive = await archiveService.parse(tarball);
      const files = archive.files;
      const paths = files
        .map((f) => f.path)
        .filter((p) => p !== 'aipkg.json')
        .sort();
      expect(paths).toEqual(['README.md', 'safety.md']);
    });

    it('ignores unrelated files in non-skill directories', async () => {
      const dir = ['rules', 'pr-create'];
      await writePkgManifest({
        dir,
        type: 'rule',
        ref: 'org443/pr-create',
        version: '1.0.0',
      });
      await writeTestFile('# pr-create', ...dir, 'pr-create.md');
      await writeTestFile('junk', ...dir, 'extra.md');
      await writeTestFile('junk', ...dir, 'notes.txt');
      const fetchSpy = mockUpload();

      await publishAction({ path: testDir(...dir) });

      const tarball = await capturedUploadBody(fetchSpy);
      const archive = await archiveService.parse(tarball);
      const files = archive.files;
      const paths = files
        .map((f) => f.path)
        .filter((p) => p !== 'aipkg.json')
        .sort();
      expect(paths).toEqual(['pr-create.md']);
    });

    it('publishes a keyed ref (org/key/slug)', async () => {
      const dir = ['rules', 'pr-create'];
      await writePkgManifest({
        dir,
        type: 'rule',
        ref: 'org443/core/pr-create',
        version: '2.0.0',
      });
      await writeTestFile('# pr-create\nKeyed.', ...dir, 'pr-create.md');
      const fetchSpy = mockUpload();

      await publishAction({ path: testDir(...dir) });

      const tarball = await capturedUploadBody(fetchSpy);
      const archive = await archiveService.parse(tarball);
      expect(archive.manifest).toMatchObject({
        type: 'rule',
        ref: 'org443/core/pr-create',
        version: '2.0.0',
      });
      expect(archive.pkgRef.key).toBe('core');
    });

    it('publishes when path points at a manifest file with a non-default name', async () => {
      await writeTestFile(
        JSON.stringify({ type: 'rule', ref: 'org443/pr-create', version: '1.0.0' }),
        'aipkg.alt.json',
      );
      await writeTestFile('# pr-create', 'pr-create.md');
      const fetchSpy = mockUpload();

      await publishAction({ path: testDir('aipkg.alt.json') });

      const tarball = await capturedUploadBody(fetchSpy);
      const archive = await archiveService.parse(tarball);
      expect(archive.manifest).toMatchObject({
        type: 'rule',
        ref: 'org443/pr-create',
        version: '1.0.0',
      });
      const files = archive.files;
      const paths = files.map((f) => f.path).sort();
      expect(paths).toEqual(['aipkg.json', 'pr-create.md']);
    });

    it('defaults to cwd when no dir is provided', async () => {
      await writePkgManifest({
        dir: [],
        type: 'rule',
        ref: 'org443/pr-create',
        version: '1.0.0',
      });
      await writeTestFile('# pr-create', 'pr-create.md');
      const fetchSpy = mockUpload();

      await publishAction();

      const tarball = await capturedUploadBody(fetchSpy);
      const archive = await archiveService.parse(tarball);
      expect(archive.manifest).toMatchObject({
        type: 'rule',
        ref: 'org443/pr-create',
        version: '1.0.0',
      });
    });

    it('routes box manifests through the box publish flow', async () => {
      await writePkgManifest({
        dir: [],
        type: 'box',
        ref: 'org443/my-agent',
        version: '1.0.0',
      });
      const fetchSpy = mockUpload();

      await publishAction();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const tarball = await capturedUploadBody(fetchSpy);
      const archive = await archiveService.parse(tarball);
      expect(archive.manifest).toMatchObject({
        type: 'box',
        ref: 'org443/my-agent',
        version: '1.0.0',
      });
    });

    it('skips upload and prints manifest + archive contents on --dry', async () => {
      const dir = ['rules', 'pr-create'];
      await writePkgManifest({
        dir,
        type: 'rule',
        ref: 'org443/pr-create',
        version: '1.0.0',
        description: 'Create a pull request',
      });
      await writeTestFile('# pr-create', ...dir, 'pr-create.md');
      await writeTestFile('# README', ...dir, 'README.md');
      const fetchSpy = mockUpload();

      await publishAction({ path: testDir(...dir), dry: true });

      expect(fetchSpy).not.toHaveBeenCalled();

      const logSpy = console.log as unknown as ReturnType<typeof vi.fn>;
      const lines = logSpy.mock.calls.map((args: unknown[]) => args.join(' '));
      const joined = lines.join('\n');
      expect(joined).toContain('Manifest');
      expect(joined).toContain('"ref": "org443/pr-create"');
      expect(joined).toContain('"version": "1.0.0"');
      expect(joined).toContain('"description": "Create a pull request"');
      expect(joined).toContain('Archive contents');
      expect(joined).toContain('aipkg.json');
      expect(joined).toContain('pr-create.md');
      expect(joined).toContain('README.md');
      expect(joined).toContain('Dry run');
      expect(joined).not.toContain('Published');
    });

    it('logs the archive contents to stdout', async () => {
      const dir = ['rules', 'pr-create'];
      await writePkgManifest({
        dir,
        type: 'rule',
        ref: 'org443/pr-create',
        version: '1.0.0',
      });
      await writeTestFile('# pr-create', ...dir, 'pr-create.md');
      await writeTestFile('# README', ...dir, 'README.md');
      mockUpload();

      await publishAction({ path: testDir(...dir) });

      const logSpy = console.log as unknown as ReturnType<typeof vi.fn>;
      const lines = logSpy.mock.calls.map((args: unknown[]) => args.join(' '));
      const joined = lines.join('\n');
      expect(joined).toContain('Archive contents');
      expect(joined).toContain('aipkg.json');
      expect(joined).toContain('pr-create.md');
      expect(joined).toContain('README.md');
    });
  });

  describe('interactive confirmation', () => {
    async function writeCmd() {
      const dir = ['rules', 'pr-create'];
      await writePkgManifest({ dir, type: 'rule', ref: 'org443/pr-create', version: '1.0.0' });
      await writeTestFile('# pr-create', ...dir, 'pr-create.md');
      return dir;
    }

    it('prints the manifest + archive contents and uploads when confirmed', async () => {
      process.stdout.isTTY = true;
      confirmMock.mockResolvedValue(true);
      const dir = await writeCmd();
      const fetchSpy = mockUpload();

      await publishAction({ path: testDir(...dir) });

      expect(confirmMock).toHaveBeenCalledOnce();
      expect(fetchSpy).toHaveBeenCalledOnce();

      const logSpy = console.log as unknown as ReturnType<typeof vi.fn>;
      const joined = logSpy.mock.calls.map((args: unknown[]) => args.join(' ')).join('\n');
      expect(joined).toContain('Manifest');
      expect(joined).toContain('Archive contents');
      expect(joined).toContain('pr-create.md');
    });

    it('aborts the upload when the user declines', async () => {
      process.stdout.isTTY = true;
      confirmMock.mockResolvedValue(false);
      const dir = await writeCmd();
      const fetchSpy = mockUpload();

      await publishAction({ path: testDir(...dir) });

      expect(confirmMock).toHaveBeenCalledOnce();
      expect(fetchSpy).not.toHaveBeenCalled();

      const logSpy = console.log as unknown as ReturnType<typeof vi.fn>;
      const joined = logSpy.mock.calls.map((args: unknown[]) => args.join(' ')).join('\n');
      expect(joined).toContain('Cancelled');
    });

    it('skips the confirmation prompt with --yes even on a TTY', async () => {
      process.stdout.isTTY = true;
      const dir = await writeCmd();
      const fetchSpy = mockUpload();

      await publishAction({ path: testDir(...dir), yes: true });

      expect(confirmMock).not.toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('does not prompt in a non-TTY (CI, pipes)', async () => {
      process.stdout.isTTY = false;
      const dir = await writeCmd();
      const fetchSpy = mockUpload();

      await publishAction({ path: testDir(...dir) });

      expect(confirmMock).not.toHaveBeenCalled();
      expect(fetchSpy).toHaveBeenCalledOnce();
    });
  });

  describe('validation', () => {
    it('throws when the dir has no aipkg.json', async () => {
      mockUpload();
      await expect(publishAction({ path: testDir('empty') })).rejects.toThrow();
    });

    it('throws when the path does not exist', async () => {
      mockUpload();
      await expect(publishAction({ path: testDir('does-not-exist') })).rejects.toThrow(/does not exist/);
    });

    it('throws when the primary <slug>.md file is missing from the directory', async () => {
      const dir = ['rules', 'pr-create'];
      await writePkgManifest({
        dir,
        type: 'rule',
        ref: 'org443/pr-create',
        version: '1.0.0',
      });
      await writeTestFile('# README', ...dir, 'README.md');
      mockUpload();

      await expect(publishAction({ path: testDir(...dir) })).rejects.toThrow('Missing required file pr-create.md');
    });
  });

  describe('network errors', () => {
    it('throws on HTTP 500', async () => {
      const dir = ['rules', 'pr-create'];
      await writePkgManifest({
        dir,
        type: 'rule',
        ref: 'org443/pr-create',
        version: '1.0.0',
      });
      await writeTestFile('# pr-create', ...dir, 'pr-create.md');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

      await expect(publishAction({ path: testDir(...dir) })).rejects.toThrow();
    });
  });
});

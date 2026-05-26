import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type AIpkgArchive, Manifest, type ManifestType, type TarEntry, archiveService } from '@local/archive';

let _tmpDir = '';
let _originalCwd = '';

export function setupTestCwd(args: { prefix: string }) {
  _tmpDir = mkdtempSync(join(tmpdir(), args.prefix));
  _originalCwd = process.cwd();
  process.chdir(_tmpDir);
}

export function teardownTestCwd() {
  process.chdir(_originalCwd);
  rmSync(_tmpDir, { recursive: true, force: true });
  _tmpDir = '';
  _originalCwd = '';
}

export function testDir(...parts: string[]) {
  return join(_tmpDir, ...parts);
}

export async function readTestFile(...parts: string[]) {
  return readFile(testDir(...parts), 'utf8');
}

export async function readTestJson(...parts: string[]) {
  const raw = await readTestFile(...parts);
  return JSON.parse(raw);
}

export async function writeTestFile(content: string, ...parts: string[]) {
  const path = testDir(...parts);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

export function testFileExists(...parts: string[]) {
  return existsSync(testDir(...parts));
}

export async function buildTestArchive(args: {
  type: ManifestType;
  org?: string;
  slug: string;
  version?: string;
  files?: TarEntry[];
}): Promise<AIpkgArchive> {
  const { type, org = 'acme', slug, version = '1.0.0', files } = args;
  const manifest = new Manifest({ type, ref: `${org}/${slug}`, version, targets: ['claude'] });
  const defaultFiles: TarEntry[] = [{ path: `${slug}.md`, body: Buffer.from(`# ${slug}\nTest content.`) }];
  const { tgz } = await archiveService.pack({ manifest, files: files ?? defaultFiles });
  return archiveService.parse(tgz);
}

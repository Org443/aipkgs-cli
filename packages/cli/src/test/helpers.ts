import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export const EMPTY_MANIFEST = JSON.stringify({ type: 'box', ref: 'test/app', version: '0.0.0' });
export const EMPTY_LOCKFILE = JSON.stringify({ deps: {} });

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

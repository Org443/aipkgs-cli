import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTestJson, setupTestCwd, teardownTestCwd, testFileExists, writeTestFile } from '../../test/helpers.ts';
import { initAction } from '../init.ts';

beforeEach(() => {
  setupTestCwd({ prefix: 'aipkg-init-test-' });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  teardownTestCwd();
  vi.restoreAllMocks();
});

describe('initAction', () => {
  it('creates aipkg.json in a fresh directory and reports it', async () => {
    await initAction();

    expect(testFileExists('aipkg.json')).toBe(true);
    const manifest = await readTestJson('aipkg.json');
    expect(manifest).toMatchObject({ type: 'box', version: '0.0.0' });

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Initialized aipkg'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('aipkg.json'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('created'));
  });

  it('reports "Already initialized" without overwriting existing files', async () => {
    const existing = JSON.stringify({ type: 'box', ref: 'test/keep', version: '9.9.9' });
    await writeTestFile(existing, 'aipkg.json');
    await writeTestFile(JSON.stringify({ deps: {} }), 'aipkg.lock');

    await initAction();

    const manifest = await readTestJson('aipkg.json');
    expect(manifest).toMatchObject({ ref: 'test/keep', version: '9.9.9' });

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Already initialized'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('already exists'));
  });
});

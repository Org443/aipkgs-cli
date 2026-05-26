import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_LOCKFILE,
  EMPTY_MANIFEST,
  readTestJson,
  setupTestCwd,
  teardownTestCwd,
  testFileExists,
  writeTestFile,
} from '../../test/helpers.ts';
import { mcpAddAction, mcpRemoveAction } from '../mcp.ts';

beforeEach(async () => {
  setupTestCwd({ prefix: 'aipkg-mcp-test-' });
  process.env.AIPKG_TARGET = 'claude';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  await writeTestFile(EMPTY_MANIFEST, 'aipkg.json');
  await writeTestFile(EMPTY_LOCKFILE, 'aipkg.lock');
});

afterEach(() => {
  teardownTestCwd();
  vi.restoreAllMocks();
  process.env.AIPKG_TARGET = undefined;
});

describe('mcp add', () => {
  it('writes an http MCP to .mcp.json, aipkg.json, and aipkg.lock', async () => {
    await mcpAddAction({
      slug: 'linear',
      url: 'https://mcp.linear.app/sse',
      headers: { Authorization: 'Bearer abc' },
    });

    expect(testFileExists('.mcp.json')).toBe(true);

    const mcpJson = await readTestJson('.mcp.json');
    expect(mcpJson).toMatchObject({
      mcpServers: {
        linear: { type: 'http', url: 'https://mcp.linear.app/sse', headers: { Authorization: 'Bearer abc' } },
      },
    });

    const manifest = await readTestJson('aipkg.json');
    expect(manifest).toMatchObject({
      deps: {
        mcps: {
          linear: { url: 'https://mcp.linear.app/sse', headers: { Authorization: 'Bearer abc' } },
        },
      },
    });

    const lockfile = await readTestJson('aipkg.lock');
    expect(lockfile).toMatchObject({
      deps: {
        mcps: {
          linear: { url: 'https://mcp.linear.app/sse', headers: { Authorization: 'Bearer abc' } },
        },
      },
    });
  });

  it('writes a stdio MCP with args and env', async () => {
    await mcpAddAction({
      slug: 'git',
      command: 'uvx',
      args: ['mcp-server-git', '--repository', '.'],
      env: { TOKEN: 'xyz' },
    });

    const mcpJson = await readTestJson('.mcp.json');
    expect(mcpJson.mcpServers.git).toMatchObject({
      type: 'stdio',
      command: 'uvx',
      args: ['mcp-server-git', '--repository', '.'],
      env: { TOKEN: 'xyz' },
    });
  });

  it('rejects when both --url and --command are provided', async () => {
    await expect(mcpAddAction({ slug: 'bad', url: 'https://x', command: 'foo' })).rejects.toThrow(
      /only one of --url or --command/,
    );
  });

  it('rejects when neither --url nor --command are provided', async () => {
    await expect(mcpAddAction({ slug: 'bad' })).rejects.toThrow(/either --url or --command/);
  });

  it('rejects invalid name characters', async () => {
    await expect(mcpAddAction({ slug: 'has spaces', url: 'https://x' })).rejects.toThrow(/Invalid mcp slug/);
  });
});

describe('mcp remove', () => {
  it('removes the entry from .mcp.json, aipkg.json, and aipkg.lock', async () => {
    await mcpAddAction({ slug: 'linear', url: 'https://mcp.linear.app/sse' });

    await mcpRemoveAction({ slug: 'linear' });

    const mcpJson = await readTestJson('.mcp.json');
    expect(mcpJson.mcpServers.linear).toBeUndefined();

    const manifest = await readTestJson('aipkg.json');
    expect(manifest.deps?.mcps?.linear).toBeUndefined();

    const lockfile = await readTestJson('aipkg.lock');
    expect(lockfile.deps?.mcps?.linear).toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTestJson, setupTestCwd, teardownTestCwd, testFileExists } from '../../../test/helpers.ts';
import { installMcp, removeMcp } from '../mcp.ts';

beforeEach(() => setupTestCwd({ prefix: 'aipkg-claude-mcp-' }));
afterEach(teardownTestCwd);

describe('installMcp', () => {
  it('writes an http MCP server to .mcp.json', async () => {
    const { written } = await installMcp({
      slug: 'linear',
      entry: { url: 'https://mcp.linear.app/sse', headers: { Authorization: 'Bearer abc' } },
    });

    expect(written).toEqual([expect.stringMatching(/\.mcp\.json$/)]);
    const config = await readTestJson('.mcp.json');
    expect(config).toEqual({
      mcpServers: {
        linear: {
          type: 'http',
          url: 'https://mcp.linear.app/sse',
          headers: { Authorization: 'Bearer abc' },
        },
      },
    });
  });

  it('writes a stdio MCP server with args and env', async () => {
    await installMcp({
      slug: 'git',
      entry: { command: 'uvx', args: ['mcp-server-git', '--repo', '.'], env: { TOKEN: 'xyz' } },
    });

    const config = await readTestJson('.mcp.json');
    expect(config.mcpServers.git).toEqual({
      type: 'stdio',
      command: 'uvx',
      args: ['mcp-server-git', '--repo', '.'],
      env: { TOKEN: 'xyz' },
    });
  });

  it('overwrites an existing entry under the same slug', async () => {
    await installMcp({ slug: 'linear', entry: { url: 'https://old.example' } });
    await installMcp({ slug: 'linear', entry: { url: 'https://new.example' } });

    const config = await readTestJson('.mcp.json');
    expect(config.mcpServers.linear).toEqual({ type: 'http', url: 'https://new.example' });
  });

  it('throws when neither url nor command is provided', async () => {
    await expect(installMcp({ slug: 'bad', entry: {} })).rejects.toThrow(/url.*command/);
  });
});

describe('removeMcp', () => {
  it('removes an existing entry and returns removed: true', async () => {
    await installMcp({ slug: 'linear', entry: { url: 'https://mcp.linear.app/sse' } });

    const { removed, path } = await removeMcp({ slug: 'linear' });

    expect(removed).toBe(true);
    expect(path).toMatch(/\.mcp\.json$/);
    const config = await readTestJson('.mcp.json');
    expect(config.mcpServers).not.toHaveProperty('linear');
  });

  it('returns removed: false when the slug is not in the config', async () => {
    await installMcp({ slug: 'linear', entry: { url: 'https://mcp.linear.app/sse' } });

    const { removed } = await removeMcp({ slug: 'missing' });

    expect(removed).toBe(false);
  });

  it('returns removed: false when .mcp.json does not exist', async () => {
    const { removed } = await removeMcp({ slug: 'whatever' });

    expect(removed).toBe(false);
    expect(testFileExists('.mcp.json')).toBe(false);
  });
});

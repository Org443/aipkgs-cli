import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTestJson, setupTestCwd, teardownTestCwd, writeTestFile } from '../../../test/helpers.ts';
import { mcpConfig, toServerConfig } from '../mcp-config.ts';

beforeEach(() => setupTestCwd({ prefix: 'aipkg-claude-mcp-config-' }));
afterEach(teardownTestCwd);

describe('mcpConfig.read', () => {
  it('returns an empty config when .mcp.json is missing', async () => {
    const result = await mcpConfig.read();
    expect(result).toEqual({ mcpServers: {} });
  });

  it('reads and parses an existing .mcp.json', async () => {
    await writeTestFile(JSON.stringify({ mcpServers: { x: { type: 'http', url: 'https://x.example' } } }), '.mcp.json');

    const result = await mcpConfig.read();
    expect(result.mcpServers.x).toEqual({ type: 'http', url: 'https://x.example' });
  });

  it('coerces a missing mcpServers field to an empty object', async () => {
    await writeTestFile(JSON.stringify({}), '.mcp.json');
    const result = await mcpConfig.read();
    expect(result).toEqual({ mcpServers: {} });
  });
});

describe('toServerConfig', () => {
  it('maps a url entry to an http server', () => {
    expect(toServerConfig({ url: 'https://x.example' })).toEqual({ type: 'http', url: 'https://x.example' });
  });

  it('honors an explicit sse type', () => {
    expect(toServerConfig({ type: 'sse', url: 'https://x.example/sse' })).toEqual({
      type: 'sse',
      url: 'https://x.example/sse',
    });
  });

  it('carries an oauth block through for http servers', () => {
    const server = toServerConfig({
      type: 'http',
      url: 'https://mcp.slack.com/mcp',
      oauth: { clientId: '1601185624273.8899143856786', callbackPort: 3118 },
    });

    expect(server).toEqual({
      type: 'http',
      url: 'https://mcp.slack.com/mcp',
      oauth: { clientId: '1601185624273.8899143856786', callbackPort: 3118 },
    });
  });

  it('maps a command entry to a stdio server', () => {
    expect(toServerConfig({ command: 'node', args: ['server.js'], env: { TOKEN: 'secret' } })).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
      env: { TOKEN: '${MY_SECRET_API_KEY}' },
    });
  });
});

describe('mcpConfig.upsertServer', () => {
  it('adds a new entry tagged with its owner', async () => {
    await mcpConfig.upsertServer({
      slug: 'x',
      server: { type: 'http', url: 'https://x.example' },
      owner: 'acme/tools',
    });

    const config = await readTestJson('.mcp.json');
    expect(config.mcpServers.x).toEqual({ type: 'http', url: 'https://x.example', __aipkg: 'acme/tools' });
  });

  it('overwrites an existing entry', async () => {
    await mcpConfig.upsertServer({
      slug: 'x',
      server: { type: 'http', url: 'https://old.example' },
      owner: 'acme/tools',
    });

    await mcpConfig.upsertServer({
      slug: 'x',
      server: { type: 'http', url: 'https://new.example' },
      owner: 'acme/tools',
    });

    const config = await readTestJson('.mcp.json');
    expect(config.mcpServers.x.url).toBe('https://new.example');
  });

  it('preserves unrelated entries when upserting', async () => {
    await mcpConfig.upsertServer({ slug: 'a', server: { type: 'http', url: 'https://a.example' }, owner: 'acme/a' });
    await mcpConfig.upsertServer({ slug: 'b', server: { type: 'http', url: 'https://b.example' }, owner: 'acme/b' });

    const config = await readTestJson('.mcp.json');
    expect(Object.keys(config.mcpServers).sort()).toEqual(['a', 'b']);
  });
});

import { parse } from 'smol-toml';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readTestFile, setupTestCwd, teardownTestCwd, testFileExists, writeTestFile } from '../../../test/helpers.ts';
import { mcpConfig, toCodexServer } from '../mcp-config.ts';

async function readToml(path: string) {
  return parse(await readTestFile(path)) as Record<string, any>;
}

beforeEach(() => setupTestCwd({ prefix: 'aipkg-codex-mcp-config-' }));
afterEach(teardownTestCwd);

describe('toCodexServer', () => {
  it('maps a url entry to an http server, renaming headers to http_headers', () => {
    expect(toCodexServer({ url: 'https://x.example', headers: { 'X-Region': 'us' } })).toEqual({
      url: 'https://x.example',
      http_headers: { 'X-Region': 'us' },
    });
  });

  it('drops aipkg type and oauth, which have no Codex [mcp_servers] equivalent', () => {
    expect(toCodexServer({ type: 'sse', url: 'https://x.example', oauth: { clientId: 'abc' } })).toEqual({
      url: 'https://x.example',
    });
  });

  it('maps a command entry to a stdio server', () => {
    expect(toCodexServer({ command: 'npx', args: ['-y', 'pkg'], env: { TOKEN: 'x' } })).toEqual({
      command: 'npx',
      args: ['-y', 'pkg'],
      env: { TOKEN: 'x' },
    });
  });
});

describe('mcpConfig.upsertServer', () => {
  it('writes a schema-clean table and records ownership in the ledger', async () => {
    const result = await mcpConfig.upsertServer({
      name: 'context7',
      server: { command: 'npx' },
      owner: 'acme/tools',
    });

    expect(result.created).toBe(true);
    const config = await readToml('.codex/config.toml');
    expect(config.mcp_servers.context7).toEqual({ command: 'npx' });
    expect(await readTestFile('.codex/aipkg-mcp.json')).toContain('"context7": "acme/tools"');
  });

  it('preserves unrelated config.toml keys when upserting', async () => {
    await writeTestFile('model = "gpt-5"\n\n[mcp_servers.existing]\nurl = "https://e.example"\n', '.codex/config.toml');

    await mcpConfig.upsertServer({ name: 'context7', server: { command: 'npx' }, owner: 'acme/tools' });

    const config = await readToml('.codex/config.toml');
    expect(config.model).toBe('gpt-5');
    expect(config.mcp_servers.existing).toEqual({ url: 'https://e.example' });
    expect(config.mcp_servers.context7).toEqual({ command: 'npx' });
  });
});

describe('mcpConfig.removeOwnedServers', () => {
  it('removes only the servers the ledger attributes to the owner', async () => {
    await mcpConfig.upsertServer({ name: 'a', server: { command: 'a' }, owner: 'acme/one' });
    await mcpConfig.upsertServer({ name: 'b', server: { command: 'b' }, owner: 'acme/two' });

    const { removed } = await mcpConfig.removeOwnedServers({ owner: 'acme/one' });

    expect(removed).toEqual(['a']);
    const config = await readToml('.codex/config.toml');
    expect(config.mcp_servers.a).toBeUndefined();
    expect(config.mcp_servers.b).toEqual({ command: 'b' });
    expect(await readTestFile('.codex/aipkg-mcp.json')).toContain('"b": "acme/two"');
  });

  it('drops the empty mcp_servers table and deletes the ledger when nothing aipkg-owned remains', async () => {
    await mcpConfig.upsertServer({ name: 'a', server: { command: 'a' }, owner: 'acme/one' });

    await mcpConfig.removeOwnedServers({ owner: 'acme/one' });

    const config = await readToml('.codex/config.toml');
    expect(config.mcp_servers).toBeUndefined();
    expect(testFileExists('.codex/aipkg-mcp.json')).toBe(false);
  });
});

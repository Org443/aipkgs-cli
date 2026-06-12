import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { McpEntry } from '@local/archive';
import { isENOENT } from '@local/shared/fs';
import { AIPKG_OWNER_KEY } from '../hooks-format.ts';

type McpServerConfig =
  | {
      type: 'http' | 'sse';
      url: string;
      headers?: Record<string, string>;
      oauth?: { clientId: string; callbackPort?: number };
    }
  | {
      type: 'stdio';
      command: string;
      args?: string[];
      env?: Record<string, string>;
    };

type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

export function toServerConfig(mcp: McpEntry): McpServerConfig {
  const { url, command, type, headers, oauth, args, env } = mcp;
  if (url) {
    return {
      type: type === 'sse' ? 'sse' : 'http',
      url,
      ...(headers ? { headers } : {}),
      ...(oauth ? { oauth } : {}),
    };
  }
  if (command) {
    return {
      type: 'stdio',
      command,
      ...(args ? { args } : {}),
      ...(env ? { env } : {}),
    };
  }
  throw new Error('MCP entry must define either a url or a command');
}

export const mcpConfig = {
  // Claude's `.mcp.json` shape and ownership tagging, but under `.agents/` so the
  // bundle stays self-contained — the standard prescribes no MCP file.
  path() {
    const cwd = process.cwd();
    return join(cwd, '.agents', 'mcp.json');
  },

  async read(): Promise<McpConfig> {
    try {
      const path = mcpConfig.path();
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as Partial<McpConfig>;
      return { mcpServers: parsed.mcpServers ?? {} };
    } catch (err) {
      if (isENOENT(err)) return { mcpServers: {} };
      throw err;
    }
  },

  async write(value: McpConfig) {
    const path = mcpConfig.path();
    await mkdir(dirname(path), { recursive: true });
    const body = `${JSON.stringify(value, null, 2)}\n`;
    await writeFile(path, body, 'utf8');
  },

  // `owner` tags the server with the slug that installed it (mirroring the hook
  // and statusLine ownership tags) so `removeOwnedServers` can later strip exactly
  // the servers a given setup bundle placed.
  async upsertServer(args: { slug: string; server: McpServerConfig; owner: string }) {
    const { slug, server, owner } = args;
    const config = await mcpConfig.read();
    const stored = { ...server, [AIPKG_OWNER_KEY]: owner };
    config.mcpServers[slug] = stored as McpServerConfig;
    await mcpConfig.write(config);
  },

  // A setup bundle keys its MCP servers by the author's chosen name rather than
  // its own ref, so removal matches on the ownership tag, not the server name.
  async removeOwnedServers(args: { owner: string }) {
    const { owner } = args;
    const config = await mcpConfig.read();
    const removed: string[] = [];
    for (const [name, server] of Object.entries(config.mcpServers)) {
      if ((server as { [AIPKG_OWNER_KEY]?: string })[AIPKG_OWNER_KEY] === owner) {
        delete config.mcpServers[name];
        removed.push(name);
      }
    }
    if (removed.length > 0) await mcpConfig.write(config);
    return { removed };
  },
};

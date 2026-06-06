import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { McpEntry } from '@local/archive';
import { isENOENT } from '../../fs.ts';
import { AIPKG_OWNER_KEY } from '../hooks-format.ts';

const MCP_CONFIG_FILENAME = '.mcp.json';

type McpHttpServerConfig = {
  type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
  oauth?: { clientId: string; callbackPort?: number };
};

type McpStdioServerConfig = {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

type McpServerConfig = McpHttpServerConfig | McpStdioServerConfig;

// Normalize a setup/registry MCP entry into the on-disk Claude server config: a
// `url` is an HTTP server (defaulting to `http`, or `sse` when the entry says
// so), a `command` is a stdio server. An `oauth` block is carried through for
// servers that authenticate via OAuth (e.g. Slack).
export function toServerConfig(mcp: McpEntry): McpServerConfig {
  if (mcp.url) {
    return {
      type: mcp.type === 'sse' ? 'sse' : 'http',
      url: mcp.url,
      ...(mcp.headers ? { headers: mcp.headers } : {}),
      ...(mcp.oauth ? { oauth: mcp.oauth } : {}),
    };
  }
  if (mcp.command) {
    return {
      type: 'stdio',
      command: mcp.command,
      ...(mcp.args ? { args: mcp.args } : {}),
      ...(mcp.env ? { env: mcp.env } : {}),
    };
  }
  throw new Error('MCP entry must define either a url or a command');
}

type McpConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

export const mcpConfig = {
  path(): string {
    return join(process.cwd(), MCP_CONFIG_FILENAME);
  },

  async read(): Promise<McpConfig> {
    try {
      const raw = await readFile(mcpConfig.path(), 'utf8');
      const parsed = JSON.parse(raw) as Partial<McpConfig>;
      return { mcpServers: parsed.mcpServers ?? {} };
    } catch (err) {
      if (isENOENT(err)) return { mcpServers: {} };
      throw err;
    }
  },

  async write(value: McpConfig) {
    const body = `${JSON.stringify(value, null, 2)}\n`;
    await writeFile(mcpConfig.path(), body, 'utf8');
  },

  // `owner` tags the server with the slug that installed it (mirroring the hook
  // and statusLine ownership tags) so `removeOwnedServers` can later strip exactly
  // the servers a given setup bundle placed. Callers that aren't setup-owned
  // (e.g. a bare `addMcp`) omit it and the entry stays untagged.
  async upsertServer(args: { slug: string; server: McpServerConfig; owner?: string }) {
    const { slug, server, owner } = args;
    const config = await mcpConfig.read();
    const existed = slug in config.mcpServers;
    const stored = owner === undefined ? server : { ...server, [AIPKG_OWNER_KEY]: owner };
    config.mcpServers[slug] = stored as McpServerConfig;
    await mcpConfig.write(config);
    return { created: !existed };
  },

  // Strip every server owned by `owner`, returning the names removed so callers
  // can report the touched config path. A setup bundle keys its MCP servers by the
  // author's chosen name rather than its own ref, so removal has to match on the
  // ownership tag, not the server name.
  async removeOwnedServers(args: { owner: string }): Promise<{ removed: string[] }> {
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

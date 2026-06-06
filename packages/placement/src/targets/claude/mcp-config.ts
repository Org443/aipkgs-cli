import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isENOENT } from '../../fs.ts';
import { AIPKG_OWNER_KEY } from '../hooks-format.ts';

export const MCP_CONFIG_FILENAME = '.mcp.json';

export type McpHttpServerConfig = {
  type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
};

export type McpStdioServerConfig = {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type McpServerConfig = McpHttpServerConfig | McpStdioServerConfig;

export type McpConfig = {
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

  async removeServer(args: { slug: string }): Promise<boolean> {
    const { slug } = args;
    const config = await mcpConfig.read();
    if (!(slug in config.mcpServers)) return false;
    delete config.mcpServers[slug];
    await mcpConfig.write(config);
    return true;
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

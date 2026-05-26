import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isENOENT } from '../../fs.ts';

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

  async upsertServer(args: { slug: string; server: McpServerConfig }) {
    const { slug, server } = args;
    const config = await mcpConfig.read();
    const existed = slug in config.mcpServers;
    config.mcpServers[slug] = server;
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
};

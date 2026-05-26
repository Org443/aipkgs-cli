import type { McpEntry } from '@local/archive';
import { type McpServerConfig, mcpConfig } from './mcp-config.ts';

export async function installMcp(args: { slug: string; entry: McpEntry }) {
  const { slug, entry } = args;
  const server = mcpEntryToServer(entry);
  await mcpConfig.upsertServer({ slug, server });
  return { written: [mcpConfig.path()] };
}

export async function removeMcp(args: { slug: string }) {
  const { slug } = args;
  const removed = await mcpConfig.removeServer({ slug });
  return { removed, path: mcpConfig.path() };
}

function mcpEntryToServer(entry: McpEntry): McpServerConfig {
  if (entry.url) {
    const server: McpServerConfig = { type: 'http', url: entry.url };
    if (entry.headers) server.headers = entry.headers;
    return server;
  }
  if (entry.command) {
    const server: McpServerConfig = { type: 'stdio', command: entry.command };
    if (entry.args) server.args = entry.args;
    if (entry.env) server.env = entry.env;
    return server;
  }
  throw new Error('McpEntry must define either `url` or `command`');
}

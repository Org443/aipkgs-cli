import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type McpEntry, isENOENT } from '@local/archive';
import { parse, stringify } from 'smol-toml';

// Codex reads MCP servers from `[mcp_servers.<name>]` tables in `config.toml`.
// aipkg writes a *project-level* `.codex/config.toml` (never the user's primary
// `~/.codex/config.toml`). Codex parses this file with strict serde
// (`deny_unknown_fields`), so — unlike Claude's `.mcp.json`, where we embed an
// `__aipkg` owner tag inside each server object — we cannot tag servers in place.
// Ownership is tracked out-of-band in an aipkg-owned sidecar ledger that Codex
// never reads, keeping every `[mcp_servers.*]` table schema-clean.
//
// Caveat: smol-toml does not preserve comments or original formatting on
// round-trip, so a user's hand-written `.codex/config.toml` is reformatted (its
// keys and values are preserved). aipkg only manages the `mcp_servers` table.
const CONFIG_FILENAME = join('.codex', 'config.toml');
const LEDGER_FILENAME = join('.codex', 'aipkg-mcp.json');

type CodexHttpServer = {
  url: string;
  http_headers?: Record<string, string>;
};

type CodexStdioServer = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

type CodexServer = CodexHttpServer | CodexStdioServer;

// Normalize an aipkg MCP entry into Codex's server shape: a `url` is an HTTP
// (streamable) server — its `headers` map to Codex's `http_headers`; a `command`
// is a stdio server. The aipkg `type` and `oauth` fields have no Codex
// equivalent under `[mcp_servers.*]` and are dropped (Codex auto-detects HTTP
// from `url` and handles OAuth via its own flow).
export function toCodexServer(mcp: McpEntry): CodexServer {
  if (mcp.url) {
    return {
      url: mcp.url,
      ...(mcp.headers ? { http_headers: mcp.headers } : {}),
    };
  }
  if (mcp.command) {
    return {
      command: mcp.command,
      ...(mcp.args ? { args: mcp.args } : {}),
      ...(mcp.env ? { env: mcp.env } : {}),
    };
  }
  throw new Error('MCP entry must define either a url or a command');
}

export const mcpConfig = {
  path(): string {
    return join(process.cwd(), CONFIG_FILENAME);
  },

  async read(): Promise<Record<string, unknown>> {
    try {
      const raw = await readFile(mcpConfig.path(), 'utf8');
      return parse(raw) as Record<string, unknown>;
    } catch (err) {
      if (isENOENT(err)) return {};
      throw err;
    }
  },

  async write(value: Record<string, unknown>) {
    const path = mcpConfig.path();
    await mkdir(dirname(path), { recursive: true });
    const body = `${stringify(value)}\n`;
    await writeFile(path, body, 'utf8');
  },

  // `owner` records, in the sidecar ledger, which setup ref placed this server so
  // `removeOwnedServers` can later strip exactly that ref's servers — the strict
  // Codex schema forbids an inline ownership tag.
  async upsertServer(args: { name: string; server: CodexServer; owner: string }) {
    const { name, server, owner } = args;
    const config = await mcpConfig.read();
    const servers = asTable(config.mcp_servers);
    servers[name] = server;
    config.mcp_servers = servers;
    await mcpConfig.write(config);
    await recordOwner({ name, owner });
  },

  // Strip every server the ledger attributes to `owner`, returning the names
  // removed so callers can report the touched config path.
  async removeOwnedServers(args: { owner: string }): Promise<{ removed: string[] }> {
    const { owner } = args;
    const ledger = await readLedger();
    const owned = Object.entries(ledger)
      .filter(([, ref]) => ref === owner)
      .map(([name]) => name);
    if (owned.length === 0) return { removed: [] };

    const config = await mcpConfig.read();
    const servers = asTable(config.mcp_servers);
    const removed = owned.filter((name) => name in servers);

    const nextServers = omit(servers, owned);
    // smol-toml has no notion of an undefined value, so drop the key entirely
    // rather than leaving an empty `mcp_servers` table behind.
    const nextConfig =
      Object.keys(nextServers).length > 0 ? { ...config, mcp_servers: nextServers } : omit(config, ['mcp_servers']);
    await mcpConfig.write(nextConfig);
    await writeLedger(omit(ledger, owned));
    return { removed };
  },
};

////
/// Helpers
//

function asTable(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function omit<T extends Record<string, unknown>>(table: T, keys: string[]): T {
  const drop = new Set(keys);
  return Object.fromEntries(Object.entries(table).filter(([key]) => !drop.has(key))) as T;
}

function ledgerPath(): string {
  return join(process.cwd(), LEDGER_FILENAME);
}

async function readLedger(): Promise<Record<string, string>> {
  try {
    const raw = await readFile(ledgerPath(), 'utf8');
    return JSON.parse(raw) as Record<string, string>;
  } catch (err) {
    if (isENOENT(err)) return {};
    throw err;
  }
}

async function writeLedger(ledger: Record<string, string>) {
  const path = ledgerPath();
  if (Object.keys(ledger).length === 0) {
    await rm(path, { force: true });
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
}

async function recordOwner(args: { name: string; owner: string }) {
  const ledger = await readLedger();
  ledger[args.name] = args.owner;
  await writeLedger(ledger);
}

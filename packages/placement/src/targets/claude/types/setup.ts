import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ArchiveSetup, PackageRef } from '@local/archive';
import { AIPKG_OWNER_KEY, REF_TOKEN, substituteRef } from '../../hooks-format.ts';
import { mcpConfig, toServerConfig } from '../mcp-config.ts';
import { settingsConfig } from '../settings-config.ts';

/**
 * Install a setup bundle into the Claude layout. Its script payload is written
 * under `.claude/scripts/<org>/<key?>/<slug>`, namespaced by the package ref so
 * bundles from different packages never collide; the hook commands reference
 * those scripts. The bundle's event map, status line, and MCP servers are then
 * merged into the agent config (`settings.local.json` / `.mcp.json`), each
 * tagged by the bundle's ref so a later remove can target exactly its entries.
 */
export async function installSetup(args: { setup: ArchiveSetup; pkgRef: PackageRef }) {
  const { setup, pkgRef } = args;
  const ref = pkgRef.manifestRef;
  const installDir = join('.claude', 'scripts', ref);
  const written: string[] = [];

  const dir = join(process.cwd(), installDir);

  for (const script of setup.scripts) {
    const dest = join(dir, script.path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, script.body);
    written.push(dest);
  }

  if (Object.keys(setup.events).length > 0) {
    const hooks = substituteRef({ events: setup.events, installDir });
    await settingsConfig.mergeHooks({ slug: ref, hooks });
    written.push(settingsConfig.path());
  }

  if (setup.statusLine) {
    const statusLine = { ...setup.statusLine };
    if (typeof statusLine.command === 'string') {
      statusLine.command = statusLine.command.replace(REF_TOKEN, installDir);
    }
    await settingsConfig.setStatusLine({ slug: ref, statusLine });
    written.push(settingsConfig.path());
  }

  if (setup.mcps) {
    for (const [name, mcp] of Object.entries(setup.mcps)) {
      // Namespace the server key by the package ref so two setups that each ship
      // a server with the same name don't collide in .mcp.json.
      const server = toServerConfig(mcp);
      await mcpConfig.upsertServer({ slug: `${ref}/${name}`, server, owner: ref });
      written.push(mcpConfig.path());
    }
  }

  return { written: dedupe(written) };
}

/**
 * Reverse a setup bundle install. The inverse of `installSetup`: delete its
 * script directory and strip the config entries it owns — hooks and MCP servers
 * tagged with `ref`, plus the status line if this bundle is the one that set it.
 * Ownership tags (not names) drive removal so a bundle only ever reverses its
 * own entries. Returns the paths touched: the script dir always, and `.mcp.json`
 * when servers were removed.
 */
export async function removeSetup(args: { ref: string }) {
  const { ref } = args;

  const dir = join(process.cwd(), '.claude', 'scripts', ref);
  await rm(dir, { recursive: true, force: true });

  await settingsConfig.removeHooks({ slug: ref });
  await clearOwnedStatusLine({ slug: ref });
  const { removed: removedMcps } = await mcpConfig.removeOwnedServers({ owner: ref });

  const removed = [dir];
  if (removedMcps.length > 0) removed.push(mcpConfig.path());
  return { removed };
}

function dedupe(paths: string[]): string[] {
  return [...new Set(paths)];
}

// Clear the status line only if this bundle owns it — a different bundle's
// status line must survive this remove.
async function clearOwnedStatusLine(args: { slug: string }) {
  const settings = await settingsConfig.read();
  const owner = settings.statusLine?.[AIPKG_OWNER_KEY];
  if (owner === args.slug) await settingsConfig.clearStatusLine();
}

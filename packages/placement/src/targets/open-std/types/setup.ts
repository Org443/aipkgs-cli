import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchiveSetup, PackageRef } from '@local/archive';
import { writeFileTree } from '../../../io/writers.ts';
import { AIPKG_OWNER_KEY, REF_TOKEN, substituteRef } from '../../hooks-format.ts';
import { mcpConfig, toServerConfig } from '../mcp-config.ts';
import { settingsConfig } from '../settings-config.ts';

/**
 * Scripts land at `.agents/scripts/<org>/<key?>/<slug>`, namespaced by the package
 * ref so bundles from different packages never collide; hook commands reference
 * them via `${PKG_ROOT}`. Hooks/status line merge into `.agents/settings.json` and
 * MCP servers into `.agents/mcp.json`, each tagged by the bundle's ref so a later
 * remove targets exactly its entries.
 */
export async function installSetup(args: { setup: ArchiveSetup; pkgRef: PackageRef }) {
  const { setup, pkgRef } = args;
  const ref = pkgRef.manifestRef;
  const installDir = join('.agents', 'scripts', ref);
  const written: string[] = [];

  const cwd = process.cwd();
  const dir = join(cwd, installDir);

  const scripts = await writeFileTree({ dir, files: setup.scripts });
  written.push(...scripts.written);

  const settingsPath = settingsConfig.path();

  if (Object.keys(setup.events).length > 0) {
    const hooks = substituteRef({ events: setup.events, installDir });
    await settingsConfig.mergeHooks({ slug: ref, hooks });
    written.push(settingsPath);
  }

  if (setup.statusLine) {
    const statusLine = { ...setup.statusLine };
    if (typeof statusLine.command === 'string') {
      statusLine.command = statusLine.command.replace(REF_TOKEN, installDir);
    }
    await settingsConfig.setStatusLine({ slug: ref, statusLine });
    written.push(settingsPath);
  }

  if (setup.mcps) {
    const mcpPath = mcpConfig.path();
    for (const [name, mcp] of Object.entries(setup.mcps)) {
      // Namespace the server key by the package ref so two setups that each ship
      // a server with the same name don't collide in mcp.json.
      const server = toServerConfig(mcp);
      await mcpConfig.upsertServer({ slug: `${ref}/${name}`, server, owner: ref });
      written.push(mcpPath);
    }
  }

  return { written: dedupe(written) };
}

// Ownership tags (not names) drive removal so a bundle only ever reverses its
// own entries.
export async function removeSetup(args: { ref: string }) {
  const { ref } = args;

  const cwd = process.cwd();
  const dir = join(cwd, '.agents', 'scripts', ref);
  await rm(dir, { recursive: true, force: true });

  await settingsConfig.removeHooks({ slug: ref });
  await clearOwnedStatusLine({ slug: ref });
  const { removed: removedMcps } = await mcpConfig.removeOwnedServers({ owner: ref });

  const removed = [dir];
  if (removedMcps.length > 0) {
    const mcpPath = mcpConfig.path();
    removed.push(mcpPath);
  }
  return { removed };
}

function dedupe(paths: string[]) {
  return [...new Set(paths)];
}

// Clear the status line only if this bundle owns it — a different bundle's status
// line must survive this remove.
async function clearOwnedStatusLine(args: { slug: string }) {
  const settings = await settingsConfig.read();
  const owner = settings.statusLine?.[AIPKG_OWNER_KEY];
  if (owner === args.slug) await settingsConfig.clearStatusLine();
}

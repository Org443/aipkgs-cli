import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchiveSetup, PackageRef } from '@local/archive';
import { writeFileTree } from '../../../io/writers.ts';
import { REF_TOKEN, substituteRef } from '../../hooks-format.ts';
import { hooksConfig } from '../hooks-config.ts';
import { mcpConfig, toCodexServer } from '../mcp-config.ts';
import { codexNotice } from '../notice.ts';

/**
 * Install a setup bundle into the Codex layout. Its script payload is written
 * under `.codex/scripts/<org>/<key?>/<slug>`, namespaced by the package ref so
 * bundles from different packages never collide; the hook commands reference
 * those scripts via `${PKG_ROOT}`. The bundle's event map merges into
 * `.codex/hooks.json` and its MCP servers into `.codex/config.toml`, each tagged
 * by the bundle's ref so a later remove targets exactly its entries.
 *
 * A bundled `statusLine` has no Codex equivalent (Codex's status line is a fixed
 * set of built-in `[tui]` items, not a custom command), so it is logged and
 * skipped rather than placed.
 */
export async function installSetup(args: { setup: ArchiveSetup; pkgRef: PackageRef }) {
  const { setup, pkgRef } = args;
  const ref = pkgRef.manifestRef;
  const installDir = join('.codex', 'scripts', ref);
  const written: string[] = [];

  const dir = join(process.cwd(), installDir);

  const scripts = await writeFileTree({ dir, files: setup.scripts });
  written.push(...scripts.written);

  if (Object.keys(setup.events).length > 0) {
    const hooks = substituteRef({ events: setup.events, installDir });
    await hooksConfig.mergeHooks({ slug: ref, hooks });
    written.push(hooksConfig.path());
  }

  if (setup.statusLine) {
    // Surfaced once here, then skipped — Codex has no custom-command status line.
    const command = typeof setup.statusLine.command === 'string' ? setup.statusLine.command : '';
    const resolved = command.replace(REF_TOKEN, installDir);
    codexNotice(`status line not supported — skipping${resolved ? ` (${resolved})` : ''}`);
  }

  if (setup.mcps) {
    for (const [name, mcp] of Object.entries(setup.mcps)) {
      const server = toCodexServer(mcp);
      await mcpConfig.upsertServer({ name, server, owner: ref });
      written.push(mcpConfig.path());
    }
  }

  return { written: dedupe(written) };
}

/**
 * Reverse a setup bundle install: delete its script directory and strip the
 * config entries it owns — hooks tagged with `ref` in `.codex/hooks.json` and the
 * MCP servers the sidecar ledger attributes to `ref`. Ownership (not names) drives
 * removal so a bundle only ever reverses its own entries.
 */
export async function removeSetup(args: { ref: string }) {
  const { ref } = args;

  const dir = join(process.cwd(), '.codex', 'scripts', ref);
  await rm(dir, { recursive: true, force: true });

  await hooksConfig.removeHooks({ slug: ref });
  const { removed: removedMcps } = await mcpConfig.removeOwnedServers({ owner: ref });

  const removed = [dir];
  if (removedMcps.length > 0) removed.push(mcpConfig.path());
  return { removed };
}

function dedupe(paths: string[]): string[] {
  return [...new Set(paths)];
}

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AIpkgArchive, ArchiveSetup, HooksByEvent, Manifest, McpEntry, PackageRef } from '@local/archive';
import { Agent, type InstallResult, type RemoveResult } from '../../agent.abstract.ts';
import { AIPKG_OWNER_KEY, REF_TOKEN, substituteRef } from '../hooks-format.ts';
import { type McpServerConfig, mcpConfig } from './mcp-config.ts';
import { settingsConfig } from './settings-config.ts';
import { installBox } from './types/box.ts';
import { installRule } from './types/rule.ts';
import { installSetup } from './types/setup.ts';
import { installSkill } from './types/skill.ts';
import { installSubagent } from './types/subagent.ts';

export class ClaudeAgent extends Agent {
  async install({ archive }: { archive: AIpkgArchive }): Promise<InstallResult> {
    const { manifest, pkgRef } = archive;

    switch (manifest.type) {
      case 'skill': {
        const [skill] = archive.skills;
        if (!skill) throw new Error(`skill archive for ${pkgRef.aipkgRef} decoded no skill`);
        const { written } = await installSkill({ skill });
        return { paths: written, deps: [] };
      }
      case 'subagent': {
        const [subagent] = archive.subagents;
        if (!subagent) throw new Error(`subagent archive for ${pkgRef.aipkgRef} decoded no subagent`);
        const { written } = await installSubagent({ subagent });
        return { paths: written, deps: [] };
      }
      case 'rule': {
        const [rule] = archive.rules;
        if (!rule) throw new Error(`rule archive for ${pkgRef.aipkgRef} decoded no rule`);
        const { written } = await installRule({ rule });
        return { paths: written, deps: [] };
      }
      case 'setup': {
        const paths = await this.placeSetup({ setup: archive.setup, pkgRef });
        return { paths, deps: [] };
      }
      case 'box': {
        const { written } = await installBox({
          rules: archive.rules,
          subagents: archive.subagents,
          skills: archive.skills,
          setup: archive.setup,
          pkgRef,
        });
        const sideEffects = await this.applySetupConfig({ setup: archive.setup, pkgRef });
        return { paths: dedupe([...written, ...sideEffects]), deps: boxDeps(archive) };
      }
      default:
        throw new Error(`Unknown manifest type: ${manifest.type}`);
    }
  }

  async remove({ type, refStr }: { type: Manifest['type']; refStr: string }): Promise<RemoveResult> {
    switch (type) {
      case 'rule':
        return this.removeFile({ dir: join('.claude', 'rules'), name: `${refStr}.md` });
      case 'subagent':
        return this.removeFile({ dir: join('.claude', 'agents'), name: `${refStr}.md` });
      case 'skill':
        return this.removeTree({ path: join(process.cwd(), '.claude', 'skills', refStr) });
      case 'setup':
        return this.removeSetup({ refStr });
      case 'box':
        // A box's bundled rule/subagent/skill children are reversed by the
        // caller walking the lockfile subtree (they each remove themselves via
        // their own type). What only the box owns is its setup bundle — scripts,
        // hooks, statusLine, and MCP servers, all tagged with the box ref — so
        // reverse those here, the same way a standalone setup remove does.
        return this.removeSetup({ refStr });
      default:
        throw new Error(`Unknown manifest type: ${type}`);
    }
  }

  async addMcp(args: { slug: string; mcp: McpEntry; owner?: string }) {
    const { slug, mcp, owner } = args;
    const server = toServerConfig(mcp);
    await mcpConfig.upsertServer({ slug, server, owner });
    return { path: mcpConfig.path() };
  }

  async removeMcp(args: { slug: string }) {
    const removed = await mcpConfig.removeServer({ slug: args.slug });
    return { removed, path: mcpConfig.path() };
  }

  async addStatusLine(args: { slug: string; statusLine: Record<string, unknown> }) {
    return settingsConfig.setStatusLine(args);
  }

  async removeStatusLine() {
    return settingsConfig.clearStatusLine();
  }

  async addHook(args: { slug: string; hooks: HooksByEvent }) {
    await settingsConfig.mergeHooks(args);
    return { path: settingsConfig.path() };
  }

  async removeHook(args: { slug: string }) {
    const changed = await settingsConfig.removeHooks(args);
    return { changed, path: settingsConfig.path() };
  }

  ////
  /// Helpers
  //

  // Place a setup bundle: its script payload on disk plus its event map, status
  // line, and MCP servers merged into the agent config (all tagged by the bundle's
  // ref so a later remove can target exactly its entries).
  private async placeSetup(args: { setup: ArchiveSetup | undefined; pkgRef: PackageRef }) {
    const { setup, pkgRef } = args;
    if (!setup) return [];

    const { written } = await installSetup({ setup, pkgRef });
    const sideEffects = await this.applySetupConfig({ setup, pkgRef });
    return dedupe([...written, ...sideEffects]);
  }

  // Apply only the config side effects of a setup bundle (hooks/statusLine/mcps).
  // The on-disk scripts are placed by `installSetup`/`installBox` separately.
  private async applySetupConfig(args: { setup: ArchiveSetup | undefined; pkgRef: PackageRef }) {
    const { setup, pkgRef } = args;
    if (!setup) return [];

    const ref = pkgRef.manifestRef;
    const installDir = join('.claude', 'scripts', ref);
    const written: string[] = [];

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
        // Namespace the server key by the package ref so two setups that each
        // ship a server with the same name don't collide in .mcp.json.
        await this.addMcp({ slug: `${ref}/${name}`, mcp, owner: ref });
        written.push(mcpConfig.path());
      }
    }

    return written;
  }

  private async removeSetup(args: { refStr: string }): Promise<RemoveResult> {
    const { refStr } = args;
    const dir = join(process.cwd(), '.claude', 'scripts', refStr);
    await rm(dir, { recursive: true, force: true });

    await settingsConfig.removeHooks({ slug: refStr });
    await this.clearOwnedStatusLine({ slug: refStr });
    const { removed: removedMcps } = await mcpConfig.removeOwnedServers({ owner: refStr });

    const paths = [dir];
    if (removedMcps.length > 0) paths.push(mcpConfig.path());
    return { paths, deps: [] };
  }

  private async clearOwnedStatusLine(args: { slug: string }) {
    const settings = await settingsConfig.read();
    const owner = settings.statusLine?.[AIPKG_OWNER_KEY];
    if (owner === args.slug) await settingsConfig.clearStatusLine();
  }

  private async removeFile(args: { dir: string; name: string }): Promise<RemoveResult> {
    const path = join(process.cwd(), args.dir, args.name);
    await rm(path, { force: true });
    return { paths: [path], deps: [] };
  }

  private async removeTree(args: { path: string }): Promise<RemoveResult> {
    await rm(args.path, { recursive: true, force: true });
    return { paths: [args.path], deps: [] };
  }
}

// A box's lockable children are the flat assets it bundles — each becomes a
// lockfile entry keyed by its own slug. The box's setup bundle is part of the
// box itself, not a separate child, so it is not listed here.
function boxDeps(archive: AIpkgArchive): InstallResult['deps'] {
  return [
    ...archive.rules.map((r) => ({ type: 'rule' as const, slug: r.slug })),
    ...archive.subagents.map((s) => ({ type: 'subagent' as const, slug: s.slug })),
    ...archive.skills.map((s) => ({ type: 'skill' as const, slug: s.slug })),
  ];
}

// Normalize a setup MCP entry into the on-disk Claude server config: a `url`
// is an HTTP server, a `command` is a stdio server.
function toServerConfig(mcp: McpEntry): McpServerConfig {
  if (mcp.url) {
    return { type: 'http', url: mcp.url, ...(mcp.headers ? { headers: mcp.headers } : {}) };
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

function dedupe(paths: string[]): string[] {
  return [...new Set(paths)];
}

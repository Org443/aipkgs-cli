import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AIpkgArchive, Manifest, McpEntry } from '@local/archive';
import { Agent, type InstallResult, type RemoveResult } from '../../agent.abstract.ts';
import { mcpConfig, toServerConfig } from './mcp-config.ts';
import { installBox } from './types/box.ts';
import { installRule } from './types/rule.ts';
import { installSetup, removeSetup } from './types/setup.ts';
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
        const { setup } = archive;
        if (!setup) throw new Error(`setup archive for ${pkgRef.aipkgRef} decoded no setup`);
        const { written } = await installSetup({ setup, pkgRef });
        return { paths: written, deps: [] };
      }
      case 'box': {
        const { written } = await installBox({
          rules: archive.rules,
          subagents: archive.subagents,
          skills: archive.skills,
          setup: archive.setup,
          pkgRef,
        });
        return { paths: dedupe(written), deps: boxDeps(archive) };
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
      case 'setup': {
        const { removed } = await removeSetup({ ref: refStr });
        return { paths: removed, deps: [] };
      }
      case 'box': {
        // A box's bundled rule/subagent/skill children are reversed by the
        // caller walking the lockfile subtree (they each remove themselves via
        // their own type). What only the box owns is its setup bundle — scripts,
        // hooks, statusLine, and MCP servers, all tagged with the box ref — so
        // reverse those here, the same way a standalone setup remove does.
        const { removed } = await removeSetup({ ref: refStr });
        return { paths: removed, deps: [] };
      }
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

  ////
  /// Helpers
  //

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

function dedupe(paths: string[]): string[] {
  return [...new Set(paths)];
}

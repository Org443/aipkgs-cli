import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { AIpkgArchive, Manifest } from '@local/archive';
import { Agent, type InstallResult, type RemoveResult } from '../../agent.abstract.ts';
import { installBox } from './types/box.ts';
import { installRule } from './types/rule.ts';
import { installSetup, removeSetup } from './types/setup.ts';
import { installSkill } from './types/skill.ts';
import { installSubagent } from './types/subagent.ts';

/**
 * The "Open Standard" target follows the Agent Skills open standard
 * (agentskills.io), which places skills under `.agents/skills/<slug>`. That spec
 * covers only skills, so the other asset types mirror the Claude layout rooted at
 * `.agents/` — rules at `.agents/rules`, subagents at `.agents/agents`, and setup
 * bundles under `.agents/scripts` with hooks/status line in
 * `.agents/settings.json` and MCP servers in `.agents/mcp.json`.
 */
export class OpenStdAgent extends Agent {
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
        const paths = dedupe(written);
        const deps = boxDeps(archive);
        return { paths, deps };
      }
      default:
        throw new Error(`Unknown manifest type: ${manifest.type}`);
    }
  }

  async remove({ type, refStr }: { type: Manifest['type']; refStr: string }): Promise<RemoveResult> {
    switch (type) {
      case 'rule': {
        const dir = join('.agents', 'rules');
        return this.removeFile({ dir, name: `${refStr}.md` });
      }
      case 'subagent': {
        const dir = join('.agents', 'agents');
        return this.removeFile({ dir, name: `${refStr}.md` });
      }
      case 'skill': {
        const cwd = process.cwd();
        const path = join(cwd, '.agents', 'skills', refStr);
        return this.removeTree({ path });
      }
      case 'setup':
      case 'box': {
        // A box's bundled rule/subagent/skill children are reversed by the caller
        // walking the lockfile subtree (each by its own type); only the setup
        // bundle — tagged with the ref — is reversed here.
        const { removed } = await removeSetup({ ref: refStr });
        return { paths: removed, deps: [] };
      }
      default:
        throw new Error(`Unknown manifest type: ${type}`);
    }
  }

  ////
  /// Helpers
  //

  private async removeFile(args: { dir: string; name: string }) {
    const { dir, name } = args;
    const cwd = process.cwd();
    const path = join(cwd, dir, name);
    await rm(path, { force: true });
    return { paths: [path], deps: [] };
  }

  private async removeTree(args: { path: string }) {
    const { path } = args;
    await rm(path, { recursive: true, force: true });
    return { paths: [path], deps: [] };
  }
}

// A box's lockable children are the flat assets it bundles — each becomes a
// lockfile entry keyed by its own slug. The box's setup bundle is part of the box
// itself, not a separate child, so it is not listed here.
function boxDeps(archive: AIpkgArchive) {
  return [
    ...archive.rules.map((r) => ({ type: 'rule' as const, slug: r.slug })),
    ...archive.subagents.map((s) => ({ type: 'subagent' as const, slug: s.slug })),
    ...archive.skills.map((s) => ({ type: 'skill' as const, slug: s.slug })),
  ];
}

function dedupe(paths: string[]) {
  return [...new Set(paths)];
}

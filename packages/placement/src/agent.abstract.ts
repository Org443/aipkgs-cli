import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AIpkgArchive,
  ArchiveRule,
  ArchiveSetup,
  ArchiveSkill,
  ArchiveSubagent,
  Manifest,
  PackageRef,
} from '@local/archive';

export type PlacementResult = {
  paths: string[];
  deps: { type: Manifest['type']; slug: string }[];
};

type WrittenResult = Promise<{ written: string[] }>;
type BoxArgs = Pick<AIpkgArchive, 'rules' | 'subagents' | 'skills' | 'setup' | 'pkgRef'>;

/**
 * Routes an archive install/remove to the right per-type handler. The routing,
 * archive-decoding guards, and filesystem-removal helpers are identical across
 * every target (Claude, Codex, Open-Std) — only the destination paths and the
 * per-type install/remove modules differ. Subclasses supply those via the
 * `install*` / `remove*` hooks below; the base owns everything else.
 */
export abstract class Agent {
  /**
   * Installs an archive into the agent resources. The archive is one of skill,
   * rule, subagent, setup, or box (boxes bundle the flat types plus a setup
   * bundle). Routing is shared; the destination layout lives in each hook.
   */
  async install({ archive }: { archive: AIpkgArchive }): Promise<PlacementResult> {
    const { manifest, pkgRef } = archive;

    switch (manifest.type) {
      case 'skill': {
        const [skill] = archive.skills;
        if (!skill) throw new Error(`skill archive for ${pkgRef.aipkgRef} decoded no skill`);
        const { written } = await this.installSkill({ skill });
        return { paths: written, deps: [] };
      }
      case 'subagent': {
        const [subagent] = archive.subagents;
        if (!subagent) throw new Error(`subagent archive for ${pkgRef.aipkgRef} decoded no subagent`);
        const { written } = await this.installSubagent({ subagent });
        return { paths: written, deps: [] };
      }
      case 'rule': {
        const [rule] = archive.rules;
        if (!rule) throw new Error(`rule archive for ${pkgRef.aipkgRef} decoded no rule`);
        const { written } = await this.installRule({ rule });
        return { paths: written, deps: [] };
      }
      case 'setup': {
        const { setup } = archive;
        if (!setup) throw new Error(`setup archive for ${pkgRef.aipkgRef} decoded no setup`);
        const { written } = await this.installSetup({ setup, pkgRef });
        return { paths: written, deps: [] };
      }
      case 'box': {
        const { written } = await this.installBox({
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

  /**
   * Removes an archive from the agent resources. `refStr` is the on-disk entry
   * key — a bare slug for flat types, or the namespaced `org/key?/slug` ref for
   * boxes/setups (i.e. `PackageRef.entryKey()`).
   *
   * A box's bundled rule/subagent/skill children are reversed by the caller
   * walking the lockfile subtree (each by its own type). What only the box owns
   * is its setup bundle — scripts, hooks, statusLine, MCP servers, all tagged
   * with the box ref — so a box remove reverses the setup bundle, same as a
   * standalone setup remove.
   */
  async remove({ type, refStr }: { type: Manifest['type']; refStr: string }): Promise<PlacementResult> {
    switch (type) {
      case 'rule':
        return this.removeRule({ refStr });
      case 'subagent':
        return this.removeSubagent({ refStr });
      case 'skill':
        return this.removeSkill({ refStr });
      case 'setup':
      case 'box':
        return this.removeSetupBundle({ refStr });
      default:
        throw new Error(`Unknown manifest type: ${type}`);
    }
  }

  ////
  /// Per-type hooks — implemented by each target with its own destination layout.
  //

  protected abstract installSkill(args: { skill: ArchiveSkill }): WrittenResult;
  protected abstract installSubagent(args: { subagent: ArchiveSubagent }): WrittenResult;
  protected abstract installRule(args: { rule: ArchiveRule }): WrittenResult;
  protected abstract installSetup(args: { setup: ArchiveSetup; pkgRef: PackageRef }): WrittenResult;
  protected abstract installBox(args: BoxArgs): WrittenResult;

  protected abstract removeRule(args: { refStr: string }): Promise<PlacementResult>;
  protected abstract removeSubagent(args: { refStr: string }): Promise<PlacementResult>;
  protected abstract removeSkill(args: { refStr: string }): Promise<PlacementResult>;
  protected abstract removeSetupBundle(args: { refStr: string }): Promise<PlacementResult>;

  ////
  /// Shared filesystem-removal helpers.
  //

  protected async removeFile(args: { dir: string; name: string }): Promise<PlacementResult> {
    const path = join(process.cwd(), args.dir, args.name);
    await rm(path, { force: true });
    return { paths: [path], deps: [] };
  }

  protected async removeTree(args: { path: string }): Promise<PlacementResult> {
    await rm(args.path, { recursive: true, force: true });
    return { paths: [args.path], deps: [] };
  }
}

// A box's lockable children are the flat assets it bundles — each becomes a
// lockfile entry keyed by its own slug. The box's setup bundle is part of the
// box itself, not a separate child, so it is not listed here.
function boxDeps(archive: AIpkgArchive): PlacementResult['deps'] {
  return [
    ...archive.rules.map((r) => ({ type: 'rule' as const, slug: r.slug })),
    ...archive.subagents.map((s) => ({ type: 'subagent' as const, slug: s.slug })),
    ...archive.skills.map((s) => ({ type: 'skill' as const, slug: s.slug })),
  ];
}

function dedupe(paths: string[]): string[] {
  return [...new Set(paths)];
}

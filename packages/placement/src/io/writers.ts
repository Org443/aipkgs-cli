import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ArchiveRule, ArchiveSetup, ArchiveSkill, ArchiveSubagent, PackageRef, TarEntry } from '@local/archive';

// The decoded children of a box archive. Every target's `installBox` accepts
// this same shape — boxes install identically everywhere, only the per-type
// installers differ.
export type BoxChildren = {
  rules: ArchiveRule[];
  subagents: ArchiveSubagent[];
  skills: ArchiveSkill[];
  setup?: ArchiveSetup;
  pkgRef: PackageRef;
};

/**
 * Write a set of tar entries under `dir`, preserving each entry's relative
 * path. The common primitive behind anything that places a file tree — skill
 * payloads, setup script bundles.
 */
export async function writeFileTree(args: { dir: string; files: TarEntry[] }) {
  const { dir, files } = args;
  const written: string[] = [];

  for (const file of files) {
    const dest = join(dir, file.path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, file.body);
    written.push(dest);
  }

  return { written };
}

/**
 * Write a skill rooted at `<cwd>/<...dir>/<slug>`: `SKILL.md` plus every
 * payload asset, preserving the asset tree. Claude roots this at
 * `.claude/skills`; the open standard (and Codex, which adopted it) at
 * `.agents/skills` — the format is identical, only the root differs.
 */
export async function writeSkillTree(args: { dir: readonly string[]; skill: ArchiveSkill }) {
  const { dir: root, skill } = args;
  const { slug, skillMd, assets } = skill;

  const dir = join(process.cwd(), ...root, slug);
  const skillEntry = { path: 'SKILL.md', body: skillMd };
  const files = [skillEntry, ...assets];
  return writeFileTree({ dir, files });
}

/**
 * Write one flat markdown file at `<cwd>/<...dir>/<slug>.md`. Rules and
 * subagents share this shape — a single doc, no payload tree — and differ
 * only in which directory a target roots them at.
 */
export async function writeDocFile(args: { dir: readonly string[]; slug: string; doc: Buffer }) {
  const { dir: root, slug, doc } = args;
  const dir = join(process.cwd(), ...root);
  await mkdir(dir, { recursive: true });

  const dest = join(dir, `${slug}.md`);
  await writeFile(dest, doc);

  return { written: [dest] };
}

/**
 * Fan a box's decoded children out to the supplied per-type installers —
 * rules, subagents, skills, then the box's own setup bundle (keyed by the box
 * ref, not a child slug). Every box installs this way regardless of target.
 */
export async function writeBoxChildren(
  args: BoxChildren & {
    installers: {
      installRule: (args: { rule: ArchiveRule }) => Promise<{ written: string[] }>;
      installSubagent: (args: { subagent: ArchiveSubagent }) => Promise<{ written: string[] }>;
      installSkill: (args: { skill: ArchiveSkill }) => Promise<{ written: string[] }>;
      installSetup: (args: { setup: ArchiveSetup; pkgRef: PackageRef }) => Promise<{ written: string[] }>;
    };
  },
) {
  const { rules, subagents, skills, setup, pkgRef, installers } = args;
  const { installRule, installSubagent, installSkill, installSetup } = installers;
  const written: string[] = [];

  for (const rule of rules) {
    const result = await installRule({ rule });
    written.push(...result.written);
  }
  for (const subagent of subagents) {
    const result = await installSubagent({ subagent });
    written.push(...result.written);
  }
  for (const skill of skills) {
    const result = await installSkill({ skill });
    written.push(...result.written);
  }
  if (setup) {
    const result = await installSetup({ setup, pkgRef });
    written.push(...result.written);
  }

  return { written };
}

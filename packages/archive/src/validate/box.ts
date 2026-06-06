import { InvalidArchive } from '../errors.ts';
import { MANIFEST_FILENAME, type Manifest } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';
import { pruneCruft } from './prune.ts';
import { type ArchiveRule, parseRule } from './rule.ts';
import { type ArchiveSetup, SETUP_FILENAME, parseSetup } from './setup.ts';
import { LICENSE_FILENAME, README_FILENAME } from './shared.ts';
import { type ArchiveSkill, parseSkill } from './skill.ts';
import { type ArchiveSubagent, parseSubagent } from './subagent.ts';

const BOX_ROOT_FILES = new Set([MANIFEST_FILENAME, README_FILENAME, LICENSE_FILENAME, SETUP_FILENAME]);
const FLAT_DEP_DIRS = new Set(['subagents', 'rules']);
const SCRIPTS_DIR = 'scripts';

// A box decodes directly into the universal archive shape: its bundled children
// become the same `rules`/`subagents`/`skills` arrays a standalone archive of
// that type yields, and its root `setup.json` (plus any `scripts/` payload)
// becomes the box's `setup`. Keeping the box layout — `skills/<slug>/**`, the
// flat `subagents|rules/<name>.md`, root `setup.json`, and `scripts/**` —
// here means it never leaks into install code.
export type BoxDecoded = {
  rules: ArchiveRule[];
  subagents: ArchiveSubagent[];
  skills: ArchiveSkill[];
  setup?: ArchiveSetup;
};

export function assertBoxArchive(args: { manifest: Manifest; files: TarEntry[] }): BoxDecoded {
  const { files } = args;

  const pruned = pruneCruft(files);

  assertBoxLayout(pruned);

  const skills = parseBoxSkills(pruned);
  const { rules, subagents } = parseBoxFlatAssets(pruned);
  const setup = parseBoxSetup(pruned);

  return { rules, subagents, skills, setup };
}

////
/// Helpers
//

function assertBoxLayout(files: TarEntry[]) {
  for (const file of files) {
    if (BOX_ROOT_FILES.has(file.path)) continue;

    const [top, ...rest] = file.path.split('/');

    if (top === 'skills') {
      // skills/<slug>/<anything…> — at least one file under a slug dir.
      if (rest.length >= 2 && rest[0] && rest[rest.length - 1]) continue;
    } else if (top === SCRIPTS_DIR) {
      // scripts/<anything…> — the setup bundle's payload files.
      if (rest.length >= 1 && rest[rest.length - 1]) continue;
    } else if (top && FLAT_DEP_DIRS.has(top)) {
      // subagents|rules/<name>.md — single .md, no nesting.
      if (rest.length === 1 && rest[0]?.endsWith('.md')) continue;
    }

    throw new InvalidArchive({ message: `box archive contains disallowed file: ${file.path}` });
  }
}

// Group `skills/<slug>/**` into one decoded skill per slug, re-rooting each
// child's files to its own layout (`skills/foo/SKILL.md` → `SKILL.md`).
function parseBoxSkills(files: TarEntry[]): ArchiveSkill[] {
  const groups = new Map<string, TarEntry[]>();

  for (const file of files) {
    const [top, slug, ...sub] = file.path.split('/');
    if (top !== 'skills' || !slug || sub.length === 0) continue;
    const group = groups.get(slug) ?? [];
    group.push({ path: sub.join('/'), body: file.body });
    groups.set(slug, group);
  }

  return Array.from(groups.entries()).map(([slug, childFiles]) => parseSkill({ slug, files: childFiles }));
}

// Decode the flat `rules/<name>.md` and `subagents/<name>.md` children, re-rooting
// each to the `<slug>.md` layout its standalone validator expects.
function parseBoxFlatAssets(files: TarEntry[]): { rules: ArchiveRule[]; subagents: ArchiveSubagent[] } {
  const rules: ArchiveRule[] = [];
  const subagents: ArchiveSubagent[] = [];

  for (const file of files) {
    const [top, name, ...rest] = file.path.split('/');
    if (rest.length > 0 || !name || !name.endsWith('.md')) continue;
    const slug = name.slice(0, -'.md'.length);
    const childFiles = [{ path: name, body: file.body }];

    if (top === 'rules') rules.push(parseRule({ slug, files: childFiles }));
    else if (top === 'subagents') subagents.push(parseSubagent({ slug, files: childFiles }));
  }

  return { rules, subagents };
}

// A box's setup comes from a root `setup.json` plus any `scripts/` payload.
// `scripts/` files without a `setup.json` would be silently dropped, so that
// is rejected to mirror the per-file strictness of the rest of the layout.
function parseBoxSetup(files: TarEntry[]): ArchiveSetup | undefined {
  const setupEntry = files.find((f) => f.path === SETUP_FILENAME);
  const scripts = files.filter((f) => f.path.split('/')[0] === SCRIPTS_DIR);

  if (!setupEntry) {
    if (scripts.length > 0) {
      throw new InvalidArchive({ message: `box archive missing required file: ${SETUP_FILENAME}` });
    }
    return undefined;
  }

  return parseSetup({ files: [setupEntry, ...scripts] });
}

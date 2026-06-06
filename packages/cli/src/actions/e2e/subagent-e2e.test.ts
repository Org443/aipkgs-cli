import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { describe, expect, it } from 'vitest';
import { readTestFile, readTestJson, testFileExists } from '../../test/helpers.ts';
import { installAction } from '../install/install.ts';
import { removeAction } from '../remove.ts';
import { mockArchiveRoutes, useE2EWorld } from './harness.ts';

useE2EWorld({ prefix: 'aipkg-subagent-e2e-' });

const SUBAGENT_REF = 'org443/reviewer';
const SUBAGENT_SLUG = 'reviewer';
const SUBAGENT_VERSION = '1.0.0';

const RULE_REF = 'org443/review-conventions';
const RULE_SLUG = 'review-conventions';
const RULE_VERSION = '1.0.0';
const RULE_DEP = `aipkg://rule/${RULE_REF}@${RULE_VERSION}`;

// A standalone subagent archive is `aipkg.json` plus a single `<slug>.md`.
function defaultSubagentFiles(): TarEntry[] {
  return [{ path: `${SUBAGENT_SLUG}.md`, body: Buffer.from('# Reviewer\nReviews diffs for correctness.\n') }];
}

async function buildSubagentTarball(args: {
  ref: string;
  version: string;
  deps?: { rules?: Record<string, string> };
  files?: TarEntry[];
}) {
  const { ref, version, deps, files } = args;
  const manifest = new Manifest({ type: 'subagent', ref, version, targets: ['claude'], deps });
  const { tgz } = await archiveService.pack({ manifest, files: files ?? defaultSubagentFiles() });
  return tgz;
}

async function buildRuleTarball(args: { ref: string; version: string; slug: string }) {
  const { ref, version, slug } = args;
  const manifest = new Manifest({ type: 'rule', ref, version, targets: ['claude'] });
  const files: TarEntry[] = [{ path: `${slug}.md`, body: Buffer.from(`# ${slug}\nReview conventions.\n`) }];
  const { tgz } = await archiveService.pack({ manifest, files });
  return tgz;
}

// Build the `org443/reviewer` subagent (depending on a rule) plus its rule dep,
// routing fetch to whichever tarball's pinned URL matches. The subagent resolves
// at `@latest`; the rule is pinned to the version the subagent's manifest declares.
async function seedRegistry() {
  const ruleTarball = await buildRuleTarball({ ref: RULE_REF, version: RULE_VERSION, slug: RULE_SLUG });
  const subagentTarball = await buildSubagentTarball({
    ref: SUBAGENT_REF,
    version: SUBAGENT_VERSION,
    deps: { rules: { [RULE_SLUG]: RULE_DEP } },
  });
  const subagentArchive = await archiveService.parse(subagentTarball);
  const ruleArchive = await archiveService.parse(ruleTarball);

  const fetchSpy = mockArchiveRoutes([
    { match: `/v1/packages/subagent/${SUBAGENT_REF}/latest/archive.tgz`, tarball: subagentTarball },
    { match: `/v1/packages/rule/${RULE_REF}/${RULE_VERSION}/archive.tgz`, tarball: ruleTarball },
  ]);

  return { subagentArchive, ruleArchive, fetchSpy };
}

describe('aipkg subagent org443/reviewer — install (with a rule dependency)', () => {
  it('places the subagent in .claude/agents, pulls in its rule dep, and records both', async () => {
    // ARRANGE
    const { subagentArchive, ruleArchive, fetchSpy } = await seedRegistry();

    // ACT: aipkg subagent org443/reviewer
    await installAction({ type: 'subagent', ref: SUBAGENT_REF });

    // ASSERT
    // The subagent lands as a flat `.md` under `.claude/agents`, keyed by its slug.
    expect(await readTestFile('.claude', 'agents', 'reviewer.md')).toBe('# Reviewer\nReviews diffs for correctness.\n');

    // The rule dependency is placed as a flat `.md` under `.claude/rules`.
    expect(await readTestFile('.claude', 'rules', 'review-conventions.md')).toBe(
      '# review-conventions\nReview conventions.\n',
    );

    // Both archives were downloaded exactly once: the subagent at @latest, the
    // rule at the version the subagent's manifest pins it to.
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // The manifest tracks only the directly-installed subagent, pinned at @latest.
    const manifest = await readTestJson('aipkg.json');
    expect(manifest.deps.subagents).toMatchObject({ reviewer: 'aipkg://subagent/org443/reviewer@latest' });
    // The transitive rule is NOT promoted into the manifest.
    expect(manifest.deps?.rules ?? {}).not.toHaveProperty('review-conventions');

    // The lockfile pins the subagent and records the rule with the subagent as parent.
    const lockfile = await readTestJson('aipkg.lock');
    expect(lockfile.deps.subagents).toMatchObject({
      reviewer: { aipkgRef: 'aipkg://subagent/org443/reviewer@1.0.0', version: '1.0.0', sha: subagentArchive.sha },
    });
    expect(lockfile.deps.rules).toMatchObject({
      'review-conventions': {
        aipkgRef: 'aipkg://rule/org443/review-conventions@1.0.0',
        version: '1.0.0',
        sha: ruleArchive.sha,
        parent: subagentArchive.pkgRef.aipkgRef,
      },
    });
  });
});

describe('aipkg subagent org443/reviewer — install then remove (round-trip)', () => {
  it('reverses the subagent and its pulled-in rule dependency', async () => {
    // ARRANGE
    await seedRegistry();

    // ACT: aipkg subagent org443/reviewer
    await installAction({ type: 'subagent', ref: SUBAGENT_REF });

    // Sanity: the install actually wrote the subagent and its rule dep.
    expect(testFileExists('.claude', 'agents', 'reviewer.md')).toBe(true);
    expect(testFileExists('.claude', 'rules', 'review-conventions.md')).toBe(true);

    // ACT: aipkg remove subagent org443/reviewer
    await removeAction({ type: 'subagent', ref: SUBAGENT_REF });

    // ASSERT
    // The subagent and the transitive rule it pulled in are both gone.
    expect(testFileExists('.claude', 'agents', 'reviewer.md')).toBe(false);
    expect(testFileExists('.claude', 'rules', 'review-conventions.md')).toBe(false);

    // Manifest and lockfile entries for both are cleared.
    const manifest = await readTestJson('aipkg.json');
    expect(manifest.deps?.subagents ?? {}).not.toHaveProperty('reviewer');

    const lockfile = await readTestJson('aipkg.lock');
    expect(lockfile.deps?.subagents ?? {}).not.toHaveProperty('reviewer');
    expect(lockfile.deps?.rules ?? {}).not.toHaveProperty('review-conventions');

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed'));
  });
});

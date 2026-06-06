import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { describe, expect, it } from 'vitest';
import { readTestFile, readTestJson, testFileExists, writeTestFile } from '../../test/helpers.ts';
import { installAction } from '../install/install.ts';
import { removeAction } from '../remove.ts';
import { mockArchiveRoutes, useE2EWorld } from './e2e-harness.ts';

useE2EWorld({ prefix: 'aipkg-skill-e2e-' });

// The `org443/research` skill: a `SKILL.md` plus a nested reference asset, so we
// can assert the asset tree is preserved on placement.
function defaultSkillFiles(): TarEntry[] {
  return [
    { path: 'SKILL.md', body: Buffer.from('# Research\nDeep research harness.\n') },
    { path: 'references/sources.md', body: Buffer.from('# Trusted sources\n') },
  ];
}

async function buildSkillTarball(args: {
  ref: string;
  version: string;
  deps?: { rules?: Record<string, string> };
  files?: TarEntry[];
}) {
  const { ref, version, deps, files } = args;
  const manifest = new Manifest({ type: 'skill', ref, version, targets: ['claude'], deps });
  const { tgz } = await archiveService.pack({ manifest, files: files ?? defaultSkillFiles() });
  return tgz;
}

async function buildRuleTarball(args: { ref: string; version: string; slug: string }) {
  const { ref, version, slug } = args;
  const manifest = new Manifest({ type: 'rule', ref, version, targets: ['claude'] });
  const files: TarEntry[] = [{ path: `${slug}.md`, body: Buffer.from(`# ${slug}\nResearch conventions.\n`) }];
  const { tgz } = await archiveService.pack({ manifest, files });
  return tgz;
}

const SKILL_REF = 'org443/research';
const RULE_REF = 'org443/research-conventions';
const RULE_SLUG = 'research-conventions';
const RULE_VERSION = '1.0.0';
const RULE_DEP = `aipkg://rule/${RULE_REF}@${RULE_VERSION}`;

// Build the `org443/research` skill (depending on the rule) plus its rule dep,
// and route fetch to whichever tarball's pinned URL matches. The skill resolves
// at `@latest` (requested by bare ref); the rule is pinned to the version the
// skill's manifest declares. Returns the parsed archives so callers can assert
// on the recorded SHAs and refs.
async function seedRegistry() {
  const ruleTarball = await buildRuleTarball({ ref: RULE_REF, version: RULE_VERSION, slug: RULE_SLUG });
  const skillTarball = await buildSkillTarball({
    ref: SKILL_REF,
    version: '1.0.0',
    deps: { rules: { [RULE_SLUG]: RULE_DEP } },
  });
  const skillArchive = await archiveService.parse(skillTarball);
  const ruleArchive = await archiveService.parse(ruleTarball);

  const fetchSpy = mockArchiveRoutes([
    { match: `/v1/packages/skill/${SKILL_REF}/latest/archive.tgz`, tarball: skillTarball },
    { match: `/v1/packages/rule/${RULE_REF}/${RULE_VERSION}/archive.tgz`, tarball: ruleTarball },
  ]);

  return { skillArchive, ruleArchive, fetchSpy };
}

describe('aipkg skill org443/research — install (with a rule dependency)', () => {
  it('places the skill, pulls in its rule dep, and records both in the manifest/lockfile', async () => {
    // ARRANGE
    const { skillArchive, ruleArchive, fetchSpy } = await seedRegistry();

    // ACT: aipkg skill org443/research
    await installAction({ type: 'skill', ref: SKILL_REF });

    // ASSERT
    // The skill lands under `.claude/skills/<slug>`, preserving its asset tree.
    expect(await readTestFile('.claude', 'skills', 'research', 'SKILL.md')).toBe(
      '# Research\nDeep research harness.\n',
    );
    expect(await readTestFile('.claude', 'skills', 'research', 'references', 'sources.md')).toBe('# Trusted sources\n');

    // The rule dependency is placed as a flat `.md` under `.claude/rules`.
    expect(await readTestFile('.claude', 'rules', 'research-conventions.md')).toBe(
      '# research-conventions\nResearch conventions.\n',
    );

    // Both archives were downloaded exactly once: the skill at @latest, the rule
    // at the version the skill's manifest pins it to.
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // The manifest tracks only the directly-installed skill, pinned at @latest.
    const manifest = await readTestJson('aipkg.json');
    expect(manifest.deps.skills).toMatchObject({ research: 'aipkg://skill/org443/research@latest' });
    // The transitive rule is NOT promoted into the manifest — it's a dep, not a
    // top-level request.
    expect(manifest.deps?.rules ?? {}).not.toHaveProperty('research-conventions');

    // The lockfile pins the skill to its downloaded version and records the rule
    // dep with the skill as its parent.
    const lockfile = await readTestJson('aipkg.lock');
    expect(lockfile.deps.skills).toMatchObject({
      research: { aipkgRef: 'aipkg://skill/org443/research@1.0.0', version: '1.0.0', sha: skillArchive.sha },
    });
    expect(lockfile.deps.rules).toMatchObject({
      'research-conventions': {
        aipkgRef: 'aipkg://rule/org443/research-conventions@1.0.0',
        version: '1.0.0',
        sha: ruleArchive.sha,
        parent: skillArchive.pkgRef.aipkgRef,
      },
    });
  });
});

describe('aipkg skill org443/research — install then remove (round-trip)', () => {
  it('reverses the skill and its pulled-in rule dependency', async () => {
    // ARRANGE
    await seedRegistry();

    // ACT: aipkg skill org443/research
    await installAction({ type: 'skill', ref: SKILL_REF });

    // Sanity: the install actually wrote the skill and its rule dep before we
    // tear it down.
    expect(testFileExists('.claude', 'skills', 'research', 'SKILL.md')).toBe(true);
    expect(testFileExists('.claude', 'rules', 'research-conventions.md')).toBe(true);

    // ACT: aipkg skill remove org443/research
    await removeAction({ type: 'skill', ref: SKILL_REF });

    // ASSERT
    // The skill directory and its assets are gone.
    expect(testFileExists('.claude', 'skills', 'research')).toBe(false);
    // The transitive rule it pulled in is removed too.
    expect(testFileExists('.claude', 'rules', 'research-conventions.md')).toBe(false);

    // Manifest and lockfile entries for both the skill and its rule dep are cleared.
    const manifest = await readTestJson('aipkg.json');
    expect(manifest.deps?.skills ?? {}).not.toHaveProperty('research');

    const lockfile = await readTestJson('aipkg.lock');
    expect(lockfile.deps?.skills ?? {}).not.toHaveProperty('research');
    expect(lockfile.deps?.rules ?? {}).not.toHaveProperty('research-conventions');

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed'));
  });

  it('leaves an unrelated rule in place when removing the skill', async () => {
    // ARRANGE
    // A rule the user installed independently must survive the skill remove.
    await writeTestFile('# hand-written\n', '.claude', 'rules', 'my-own-rule.md');
    await seedRegistry();

    // ACT: aipkg skill org443/research, then aipkg skill remove org443/research
    await installAction({ type: 'skill', ref: SKILL_REF });
    await removeAction({ type: 'skill', ref: SKILL_REF });

    // ASSERT
    expect(testFileExists('.claude', 'skills', 'research')).toBe(false);
    expect(testFileExists('.claude', 'rules', 'research-conventions.md')).toBe(false);
    expect(await readTestFile('.claude', 'rules', 'my-own-rule.md')).toBe('# hand-written\n');
  });
});

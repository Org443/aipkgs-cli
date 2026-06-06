import { Manifest, type TarEntry, archiveService } from '@local/archive';
import { describe, expect, it } from 'vitest';
import { readTestFile, readTestJson, testFileExists, writeTestFile } from '../../test/helpers.ts';
import { installAction } from '../install/install.ts';
import { removeAction } from '../remove.ts';
import { mockArchiveFetch, useE2EWorld } from './harness.ts';

useE2EWorld({ prefix: 'aipkg-rule-e2e-' });

const RULE_REF = 'org443/commit-style';
const RULE_SLUG = 'commit-style';
const RULE_VERSION = '1.0.0';

// A standalone rule archive is just `aipkg.json` plus a single `<slug>.md`.
function defaultRuleFiles(): TarEntry[] {
  return [{ path: `${RULE_SLUG}.md`, body: Buffer.from('# Commit style\nWrite imperative subjects.\n') }];
}

async function buildRuleTarball(args: { ref: string; version: string; files?: TarEntry[] }) {
  const { ref, version, files } = args;
  const manifest = new Manifest({ type: 'rule', ref, version, targets: ['claude'] });
  const { tgz } = await archiveService.pack({ manifest, files: files ?? defaultRuleFiles() });
  return tgz;
}

// Build the `org443/commit-style` rule and route fetch to it. Returns the parsed
// archive so callers can assert on the recorded SHA, plus the fetch spy.
async function seedRegistry() {
  const tarball = await buildRuleTarball({ ref: RULE_REF, version: RULE_VERSION });
  const archive = await archiveService.parse(tarball);
  const fetchSpy = mockArchiveFetch(tarball);
  return { archive, fetchSpy };
}

describe('aipkg rule org443/commit-style — install', () => {
  it('places the rule as a flat .md and tracks it by slug in the manifest/lockfile', async () => {
    // ARRANGE
    const { archive: expectedArchive, fetchSpy } = await seedRegistry();

    // ACT: aipkg rule org443/commit-style
    await installAction({ type: 'rule', ref: RULE_REF });

    // ASSERT
    // The rule lands as a flat `.md` under `.claude/rules`, keyed by its slug.
    expect(await readTestFile('.claude', 'rules', 'commit-style.md')).toBe(
      '# Commit style\nWrite imperative subjects.\n',
    );

    // The manifest tracks the rule by its bare slug, pinned at @latest.
    const manifest = await readTestJson('aipkg.json');
    expect(manifest.deps.rules).toMatchObject({ 'commit-style': 'aipkg://rule/org443/commit-style@latest' });

    // The lockfile pins the rule to its downloaded version and SHA.
    const lockfile = await readTestJson('aipkg.lock');
    expect(lockfile.deps.rules).toMatchObject({
      'commit-style': {
        aipkgRef: 'aipkg://rule/org443/commit-style@1.0.0',
        version: '1.0.0',
        sha: expectedArchive.sha,
      },
    });

    // The archive was downloaded once, at @latest.
    // biome-ignore lint/style/noNonNullAssertion: test assertion
    const calledUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(calledUrl).toContain('/v1/packages/rule/org443/commit-style/latest/archive.tgz');
  });
});

describe('aipkg rule org443/commit-style — install then remove (round-trip)', () => {
  it('reverses the placed rule and its manifest/lockfile entries', async () => {
    // ARRANGE
    await seedRegistry();

    // ACT: aipkg rule org443/commit-style
    await installAction({ type: 'rule', ref: RULE_REF });

    // Sanity: the install actually wrote the rule before we tear it down.
    expect(testFileExists('.claude', 'rules', 'commit-style.md')).toBe(true);

    // ACT: aipkg remove rule org443/commit-style
    await removeAction({ type: 'rule', ref: RULE_REF });

    // ASSERT
    // The rule file is gone.
    expect(testFileExists('.claude', 'rules', 'commit-style.md')).toBe(false);

    // Manifest and lockfile entries are cleared.
    const manifest = await readTestJson('aipkg.json');
    expect(manifest.deps?.rules ?? {}).not.toHaveProperty('commit-style');

    const lockfile = await readTestJson('aipkg.lock');
    expect(lockfile.deps?.rules ?? {}).not.toHaveProperty('commit-style');

    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Removed'));
  });

  it('leaves an unrelated hand-written rule in place when removing the rule', async () => {
    // ARRANGE
    // A rule the user authored by hand must survive the package remove.
    await writeTestFile('# hand-written\n', '.claude', 'rules', 'my-own-rule.md');
    await seedRegistry();

    // ACT: aipkg rule org443/commit-style, then aipkg remove rule org443/commit-style
    await installAction({ type: 'rule', ref: RULE_REF });
    await removeAction({ type: 'rule', ref: RULE_REF });

    // ASSERT
    expect(testFileExists('.claude', 'rules', 'commit-style.md')).toBe(false);
    expect(await readTestFile('.claude', 'rules', 'my-own-rule.md')).toBe('# hand-written\n');
  });
});

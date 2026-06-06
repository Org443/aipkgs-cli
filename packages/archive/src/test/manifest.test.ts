import { describe, expect, it } from 'vitest';
import { InvalidManifest } from '../errors.ts';
import { Manifest } from '../manifest.ts';

describe('Manifest.toObject()', () => {
  it('returns minimal manifest fields', () => {
    const manifest = new Manifest({
      type: 'box',
      ref: 'acme/bot',
      version: '1.0.0',
    });

    expect(manifest.toObject()).toMatchObject({
      type: 'box',
      ref: 'acme/bot',
      version: '1.0.0',
      description: undefined,
      targets: undefined,
      deps: undefined,
    });
  });

  it('preserves description and targets', () => {
    const manifest = new Manifest({
      type: 'box',
      ref: 'acme/bot',
      version: '1.0.0',
      description: 'A helpful bot',
      targets: ['claude', 'codex'],
    });

    expect(manifest.toObject()).toMatchObject({
      description: 'A helpful bot',
      targets: ['claude', 'codex'],
    });
  });

  it('preserves homepage, repository, and issues', () => {
    const manifest = new Manifest({
      type: 'box',
      ref: 'acme/bot',
      version: '1.0.0',
      homepage: 'https://acme.example/bot',
      repository: { type: 'git', url: 'https://github.com/acme/bot.git', directory: 'packages/bot' },
      issues: { url: 'https://github.com/acme/bot/issues', email: 'bugs@acme.example' },
    });

    expect(manifest.toObject()).toMatchObject({
      homepage: 'https://acme.example/bot',
      repository: { type: 'git', url: 'https://github.com/acme/bot.git', directory: 'packages/bot' },
      issues: { url: 'https://github.com/acme/bot/issues', email: 'bugs@acme.example' },
    });
  });

  it('serializes string asset entries to aipkg:// refs', () => {
    const manifest = new Manifest({
      type: 'box',
      ref: 'acme/bot',
      version: '1.0.0',
      deps: {
        skills: { deploy: 'skill/acme/utils/deploy@2.1.0' },
        subagents: { reviewer: 'subagent/acme/reviewer@1.2.3' },
        rules: { lint: 'rule/acme/style/lint@latest' },
      },
    });

    expect(manifest.toObject()).toMatchObject({
      deps: {
        skills: { deploy: 'aipkg://skill/acme/utils/deploy@2.1.0' },
        subagents: { reviewer: 'aipkg://subagent/acme/reviewer@1.2.3' },
        rules: { lint: 'aipkg://rule/acme/style/lint@latest' },
      },
    });
  });

  it('round-trips through JSON.stringify back into a Manifest', () => {
    const original = new Manifest({
      type: 'box',
      ref: 'acme/bot',
      version: '1.0.0',
      description: 'A helpful bot',
      targets: ['claude'],
      deps: {
        subagents: { reviewer: 'subagent/acme/reviewer@1.2.3' },
        skills: { deploy: 'skill/acme/utils/deploy@2.1.0' },
      },
    });

    const text = JSON.stringify(original.toObject());
    const reparsed = new Manifest({ text });

    expect(reparsed.toObject()).toEqual(original.toObject());
  });

  it('omits asset buckets that were not provided', () => {
    const manifest = new Manifest({
      type: 'box',
      ref: 'acme/bot',
      version: '1.0.0',
      deps: {
        subagents: { reviewer: 'subagent/acme/reviewer@1.2.3' },
      },
    });

    const obj = manifest.toObject();
    expect(obj.deps?.subagents).toEqual({ reviewer: 'aipkg://subagent/acme/reviewer@1.2.3' });
    expect(obj.deps?.skills).toBeUndefined();
    expect(obj.deps?.rules).toBeUndefined();
    expect(obj.deps?.boxes).toBeUndefined();
  });
});

describe('Manifest deps validation', () => {
  it('rejects a deps object with an unknown key', () => {
    const build = () =>
      new Manifest({
        type: 'box',
        ref: 'acme/bot',
        version: '1.0.0',
        deps: {
          hooks: { lint: 'rule/acme/style/lint@1.0.0' },
        } as any,
      });

    expect(build).toThrow(InvalidManifest);
  });
});

describe('Manifest.bumpVersion()', () => {
  it('increments the patch segment', () => {
    const manifest = new Manifest({ type: 'rule', ref: 'acme/lint', version: '1.2.3' });
    expect(manifest.bumpVersion('patch')).toBe('1.2.4');
    expect(manifest.version).toBe('1.2.4');
  });

  it('increments the minor segment and resets patch', () => {
    const manifest = new Manifest({ type: 'rule', ref: 'acme/lint', version: '1.2.3' });
    expect(manifest.bumpVersion('minor')).toBe('1.3.0');
    expect(manifest.version).toBe('1.3.0');
  });

  it('increments the major segment and resets minor + patch', () => {
    const manifest = new Manifest({ type: 'rule', ref: 'acme/lint', version: '1.2.3' });
    expect(manifest.bumpVersion('major')).toBe('2.0.0');
    expect(manifest.version).toBe('2.0.0');
  });

  it('drops a prerelease suffix when bumping', () => {
    const manifest = new Manifest({ type: 'rule', ref: 'acme/lint', version: '1.2.3-beta.1' });
    expect(manifest.bumpVersion('patch')).toBe('1.2.4');
  });

  it('rebuilds the derived pkgRef so it carries the new version', () => {
    const manifest = new Manifest({ type: 'rule', ref: 'acme/lint', version: '1.2.3' });
    manifest.bumpVersion('minor');
    expect(manifest.pkgRef.version).toBe('1.3.0');
    expect(manifest.pkgRef.aipkgRef).toBe('aipkg://rule/acme/lint@1.3.0');
  });

  it('reflects the bumped version in toObject()', () => {
    const manifest = new Manifest({ type: 'rule', ref: 'acme/lint', version: '1.2.3' });
    manifest.bumpVersion('major');
    expect(manifest.toObject()).toMatchObject({ version: '2.0.0' });
  });
});

import { describe, expect, it } from 'vitest';
import { Manifest } from '../../manifest.ts';
import type { TarEntry } from '../../tarball.ts';
import { assertBoxArchive } from '../box.ts';

function buildManifest() {
  return new Manifest({
    type: 'box',
    ref: 'acme/bot',
    version: '1.0.0',
    deps: { subagents: { researcher: 'subagent/acme/researcher@1.0.0' } },
  });
}

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

describe('assertBoxArchive', () => {
  it('accepts archive with only the manifest', () => {
    const manifest = buildManifest();
    const decoded = assertBoxArchive({ manifest, files: [file('aipkg.json')] });
    expect(decoded).toMatchObject({ rules: [], subagents: [], skills: [], setup: undefined });
  });

  it('accepts optional README.md, LICENSE.txt siblings', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('README.md'), file('LICENSE.txt', 'MIT')];
    const decoded = assertBoxArchive({ manifest, files });
    expect(decoded.rules).toEqual([]);
  });

  it('prunes .DS_Store and other cruft silently', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('.DS_Store'), file('.git/HEAD'), file('node_modules/foo/index.js')];
    const decoded = assertBoxArchive({ manifest, files });
    expect(decoded).toMatchObject({ rules: [], subagents: [], skills: [] });
  });

  it('throws on disallowed extra files', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('extra.md')];
    expect(() => assertBoxArchive({ manifest, files })).toThrow(/disallowed file: extra\.md/);
  });

  it('decodes flat deps under subagents/, rules/', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('subagents/researcher.md', 'agent'), file('rules/style.md', 'rule')];
    const decoded = assertBoxArchive({ manifest, files });
    expect(decoded.rules).toMatchObject([{ slug: 'style' }]);
    expect(decoded.rules[0]?.doc.toString()).toBe('rule');
    expect(decoded.subagents).toMatchObject([{ slug: 'researcher' }]);
    expect(decoded.subagents[0]?.doc.toString()).toBe('agent');
    expect(decoded.skills).toEqual([]);
  });

  it('decodes skill trees under skills/<slug>/', () => {
    const manifest = buildManifest();
    const files = [
      file('aipkg.json'),
      file('skills/foo/SKILL.md', 'foo'),
      file('skills/foo/assets/diagram.png', 'png'),
      file('skills/bar/SKILL.md', 'bar'),
    ];
    const decoded = assertBoxArchive({ manifest, files });
    expect(decoded.skills).toHaveLength(2);
    const foo = decoded.skills.find((s) => s.slug === 'foo');
    expect(foo?.skillMd.toString()).toBe('foo');
    expect(foo?.assets).toMatchObject([{ path: 'assets/diagram.png' }]);
  });

  it('throws on non-.md files inside flat dep dirs', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('rules/greet.txt')];
    expect(() => assertBoxArchive({ manifest, files })).toThrow(/disallowed file: rules\/greet\.txt/);
  });

  it('throws on nested files inside flat dep dirs', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('rules/nested/greet.md')];
    expect(() => assertBoxArchive({ manifest, files })).toThrow(/disallowed file: rules\/nested\/greet\.md/);
  });

  it('throws on files directly under skills/ without a slug dir', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('skills/loose.md')];
    expect(() => assertBoxArchive({ manifest, files })).toThrow(/disallowed file: skills\/loose\.md/);
  });

  it('decodes a root setup.json plus scripts/ into setup', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('setup.json', '{}'), file('scripts/lint.sh', 'echo hi')];
    const decoded = assertBoxArchive({ manifest, files });
    expect(decoded.setup?.scripts.map((s) => s.path)).toEqual(['scripts/lint.sh']);
  });

  it('throws when scripts/ exist but setup.json is missing', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('scripts/lint.sh')];
    expect(() => assertBoxArchive({ manifest, files })).toThrow(/missing required file: setup\.json/);
  });
});

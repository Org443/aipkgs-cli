import { describe, expect, it } from 'vitest';
import { Manifest } from '../../manifest.ts';
import type { TarEntry } from '../../tarball.ts';
import { assertRuleArchive } from '../rule.ts';

function buildManifest() {
  return new Manifest({ type: 'rule', ref: 'acme/style/lint', version: '1.2.3' });
}

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

describe('assertRuleArchive', () => {
  it('accepts archive with only the required rule file', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('lint.md', '# lint')];
    const result = assertRuleArchive({ manifest, files });
    expect(result.files.map((f) => f.path)).toEqual(['aipkg.json', 'lint.md']);
  });

  it('accepts LICENSE.txt and README.md siblings', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('lint.md'), file('LICENSE.txt'), file('README.md')];
    const result = assertRuleArchive({ manifest, files });
    expect(result.files).toHaveLength(4);
  });

  it('prunes cruft (.DS_Store, .git/*)', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('lint.md'), file('.DS_Store'), file('.git/config')];
    const result = assertRuleArchive({ manifest, files });
    expect(result.files.map((f) => f.path).sort()).toEqual(['aipkg.json', 'lint.md']);
  });

  it('throws when rule file is missing', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json')];
    expect(() => assertRuleArchive({ manifest, files })).toThrow(/missing required file: lint\.md/);
  });

  it('throws on disallowed extra files', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('lint.md'), file('other.json')];
    expect(() => assertRuleArchive({ manifest, files })).toThrow(/disallowed file: other\.json/);
  });
});

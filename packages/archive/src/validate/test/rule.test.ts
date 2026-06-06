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
  it('decodes the rule into its slug and doc body', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('lint.md', '# lint')];
    const rule = assertRuleArchive({ manifest, files });
    expect(rule.slug).toBe('lint');
    expect(rule.doc.toString()).toBe('# lint');
  });

  it('accepts LICENSE.txt and README.md siblings', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('lint.md', '# lint'), file('LICENSE.txt'), file('README.md')];
    const rule = assertRuleArchive({ manifest, files });
    expect(rule).toMatchObject({ slug: 'lint' });
  });

  it('prunes cruft (.DS_Store, .git/*)', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('lint.md', 'x'), file('.DS_Store'), file('.git/config')];
    const rule = assertRuleArchive({ manifest, files });
    expect(rule.doc.toString()).toBe('x');
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

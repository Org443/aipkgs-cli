import { describe, expect, it } from 'vitest';
import { Manifest } from '../../manifest.ts';
import type { TarEntry } from '../../tarball.ts';
import { assertSkillArchive } from '../skill.ts';

function buildManifest() {
  return new Manifest({ type: 'skill', ref: 'acme/skills/pdf-tools', version: '0.1.0' });
}

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

describe('assertSkillArchive', () => {
  it('decodes the slug and SKILL.md body, with no assets', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('SKILL.md', '---\nname: pdf-tools\n---')];
    const skill = assertSkillArchive({ manifest, files });
    expect(skill.slug).toBe('pdf-tools');
    expect(skill.skillMd.toString()).toBe('---\nname: pdf-tools\n---');
    expect(skill.assets).toEqual([]);
  });

  it('surfaces arbitrary payload files as assets (sidecars excluded)', () => {
    const manifest = buildManifest();
    const files = [
      file('aipkg.json'),
      file('SKILL.md'),
      file('README.md'),
      file('LICENSE.txt'),
      file('scripts/run.py'),
      file('assets/template.txt'),
      file('references/spec.md'),
    ];
    const skill = assertSkillArchive({ manifest, files });
    expect(skill.assets.map((a) => a.path).sort()).toEqual(
      ['assets/template.txt', 'references/spec.md', 'scripts/run.py'].sort(),
    );
  });

  it('prunes cruft', () => {
    const manifest = buildManifest();
    const files = [
      file('aipkg.json'),
      file('SKILL.md'),
      file('.DS_Store'),
      file('node_modules/foo/index.js'),
      file('.git/HEAD'),
    ];
    const skill = assertSkillArchive({ manifest, files });
    expect(skill.assets).toEqual([]);
  });

  it('throws when SKILL.md is missing', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('README.md')];
    expect(() => assertSkillArchive({ manifest, files })).toThrow(/missing required file: SKILL\.md/);
  });
});

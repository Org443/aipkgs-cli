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
  it('accepts archive with minimum required SKILL.md at the root', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('SKILL.md', '---\nname: pdf-tools\n---')];
    const result = assertSkillArchive({ manifest, files });
    expect(result.files.map((f) => f.path).sort()).toEqual(['SKILL.md', 'aipkg.json']);
  });

  it('accepts arbitrary files alongside SKILL.md', () => {
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
    const result = assertSkillArchive({ manifest, files });
    expect(result.files).toHaveLength(7);
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
    const result = assertSkillArchive({ manifest, files });
    expect(result.files.map((f) => f.path).sort()).toEqual(['SKILL.md', 'aipkg.json']);
  });

  it('throws when SKILL.md is missing', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('README.md')];
    expect(() => assertSkillArchive({ manifest, files })).toThrow(/missing required file: SKILL\.md/);
  });
});

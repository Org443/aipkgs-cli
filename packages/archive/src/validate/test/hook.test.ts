import { describe, expect, it } from 'vitest';
import { Manifest } from '../../manifest.ts';
import type { TarEntry } from '../../tarball.ts';
import { assertHookArchive } from '../hook.ts';

function buildManifest() {
  return new Manifest({ type: 'hook', ref: 'acme/lint', version: '0.1.0' });
}

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

describe('assertHookArchive', () => {
  it('accepts archive with minimum required hooks.json at the root', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('hooks.json', '{"hooks":[]}')];
    const result = assertHookArchive({ manifest, files });
    expect(result.files.map((f) => f.path).sort()).toEqual(['aipkg.json', 'hooks.json']);
  });

  it('accepts arbitrary files alongside hooks.json', () => {
    const manifest = buildManifest();
    const files = [
      file('aipkg.json'),
      file('hooks.json', '{"hooks":[]}'),
      file('README.md'),
      file('HERO_CARD.md'),
      file('LICENSE.txt'),
      file('scripts/lint.sh'),
      file('scripts/lib/util.sh'),
    ];
    const result = assertHookArchive({ manifest, files });
    expect(result.files).toHaveLength(7);
  });

  it('prunes cruft', () => {
    const manifest = buildManifest();
    const files = [
      file('aipkg.json'),
      file('hooks.json', '{"hooks":[]}'),
      file('.DS_Store'),
      file('node_modules/foo/index.js'),
      file('.git/HEAD'),
    ];
    const result = assertHookArchive({ manifest, files });
    expect(result.files.map((f) => f.path).sort()).toEqual(['aipkg.json', 'hooks.json']);
  });

  it('throws when hooks.json is missing', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('scripts/lint.sh')];
    expect(() => assertHookArchive({ manifest, files })).toThrow(/missing required file: hooks\.json/);
  });

  it('throws when hooks.json is not valid JSON', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('hooks.json', 'not-json{')];
    expect(() => assertHookArchive({ manifest, files })).toThrow(/hooks\.json is not valid JSON/);
  });
});

import { describe, expect, it } from 'vitest';
import { Manifest } from '../../manifest.ts';
import type { TarEntry } from '../../tarball.ts';
import { assertCmdArchive } from '../cmd.ts';

function buildManifest() {
  return new Manifest({ type: 'cmd', ref: 'acme/johns/pr-create', version: '0.4.2' });
}

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

describe('assertCmdArchive', () => {
  it('accepts archive with only the required cmd file', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('pr-create.md', '# pr-create')];
    const result = assertCmdArchive({ manifest, files });
    expect(result.files.map((f) => f.path)).toEqual(['aipkg.json', 'pr-create.md']);
  });

  it('accepts optional LICENSE.txt, README.md siblings', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('pr-create.md'), file('LICENSE.txt', 'MIT'), file('README.md')];
    const result = assertCmdArchive({ manifest, files });
    expect(result.files.map((f) => f.path).sort()).toEqual(
      ['LICENSE.txt', 'README.md', 'aipkg.json', 'pr-create.md'].sort(),
    );
  });

  it('prunes .DS_Store and other cruft silently', () => {
    const manifest = buildManifest();
    const files = [
      file('aipkg.json'),
      file('pr-create.md'),
      file('.DS_Store'),
      file('.git/HEAD'),
      file('node_modules/foo/index.js'),
    ];
    const result = assertCmdArchive({ manifest, files });
    expect(result.files.map((f) => f.path).sort()).toEqual(['aipkg.json', 'pr-create.md']);
  });

  it('throws when the cmd file is missing', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json')];
    expect(() => assertCmdArchive({ manifest, files })).toThrow(/missing required file: pr-create\.md/);
  });

  it('throws on disallowed extra files', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('pr-create.md'), file('extra.md')];
    expect(() => assertCmdArchive({ manifest, files })).toThrow(/disallowed file: extra\.md/);
  });
});

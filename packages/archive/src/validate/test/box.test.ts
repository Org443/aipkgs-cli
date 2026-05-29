import { describe, expect, it } from 'vitest';
import { Manifest } from '../../manifest.ts';
import type { TarEntry } from '../../tarball.ts';
import { assertBoxArchive } from '../box.ts';

function buildManifest() {
  return new Manifest({
    type: 'box',
    ref: 'acme/bot',
    version: '1.0.0',
    deps: { cmds: { greet: 'cmd/acme/greet@1.0.0' } },
  });
}

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

describe('assertBoxArchive', () => {
  it('accepts archive with only the manifest', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json')];
    const result = assertBoxArchive({ manifest, files });
    expect(result.files.map((f) => f.path)).toEqual(['aipkg.json']);
  });

  it('accepts optional README.md, LICENSE.txt siblings', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('README.md'), file('LICENSE.txt', 'MIT')];
    const result = assertBoxArchive({ manifest, files });
    expect(result.files.map((f) => f.path).sort()).toEqual(['LICENSE.txt', 'README.md', 'aipkg.json'].sort());
  });

  it('prunes .DS_Store and other cruft silently', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('.DS_Store'), file('.git/HEAD'), file('node_modules/foo/index.js')];
    const result = assertBoxArchive({ manifest, files });
    expect(result.files.map((f) => f.path)).toEqual(['aipkg.json']);
  });

  it('throws on disallowed extra files', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('extra.md')];
    expect(() => assertBoxArchive({ manifest, files })).toThrow(/disallowed file: extra\.md/);
  });

  it('accepts manifest with no deps', () => {
    const manifest = new Manifest({ type: 'box', ref: 'acme/bot', version: '1.0.0' });
    const files = [file('aipkg.json')];
    const result = assertBoxArchive({ manifest, files });
    expect(result.files.map((f) => f.path)).toEqual(['aipkg.json']);
  });

  it('accepts flat dep files under cmds/, subagents/, rules/', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('cmds/greet.md'), file('subagents/researcher.md'), file('rules/style.md')];
    const result = assertBoxArchive({ manifest, files });
    expect(result.files.map((f) => f.path).sort()).toEqual(
      ['aipkg.json', 'cmds/greet.md', 'rules/style.md', 'subagents/researcher.md'].sort(),
    );
  });

  it('accepts skill trees under skills/<slug>/', () => {
    const manifest = buildManifest();
    const files = [
      file('aipkg.json'),
      file('skills/foo/SKILL.md'),
      file('skills/foo/assets/diagram.png'),
      file('skills/bar/SKILL.md'),
    ];
    const result = assertBoxArchive({ manifest, files });
    expect(result.files.map((f) => f.path).sort()).toEqual(
      ['aipkg.json', 'skills/bar/SKILL.md', 'skills/foo/SKILL.md', 'skills/foo/assets/diagram.png'].sort(),
    );
  });

  it('throws on non-.md files inside flat dep dirs', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('cmds/greet.txt')];
    expect(() => assertBoxArchive({ manifest, files })).toThrow(/disallowed file: cmds\/greet\.txt/);
  });

  it('throws on nested files inside flat dep dirs', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('cmds/nested/greet.md')];
    expect(() => assertBoxArchive({ manifest, files })).toThrow(/disallowed file: cmds\/nested\/greet\.md/);
  });

  it('throws on files directly under skills/ without a slug dir', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('skills/loose.md')];
    expect(() => assertBoxArchive({ manifest, files })).toThrow(/disallowed file: skills\/loose\.md/);
  });

  it('accepts a flat hook bundle under hooks/', () => {
    const manifest = buildManifest();
    const files = [
      file('aipkg.json'),
      file('hooks/hooks.json', '{"hooks":[]}'),
      file('hooks/script.cmd'),
      file('hooks/scripts/lint.sh'),
    ];
    const result = assertBoxArchive({ manifest, files });
    expect(result.files.map((f) => f.path).sort()).toEqual(
      ['aipkg.json', 'hooks/hooks.json', 'hooks/script.cmd', 'hooks/scripts/lint.sh'].sort(),
    );
  });

  it('throws when hooks/ has files but hooks.json is missing', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('hooks/scripts/lint.sh')];
    expect(() => assertBoxArchive({ manifest, files })).toThrow(/missing required file: hooks\/hooks\.json/);
  });
});

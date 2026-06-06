import { describe, expect, it } from 'vitest';
import { Manifest } from '../../manifest.ts';
import type { TarEntry } from '../../tarball.ts';
import { assertSubagentArchive } from '../subagent.ts';

function buildManifest() {
  return new Manifest({ type: 'subagent', ref: 'acme/agents/reviewer', version: '0.1.0' });
}

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

describe('assertSubagentArchive', () => {
  it('decodes the subagent into its slug and doc body', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('reviewer.md', '---\nname: reviewer\n---\nbody')];
    const subagent = assertSubagentArchive({ manifest, files });
    expect(subagent.slug).toBe('reviewer');
    expect(subagent.doc.toString()).toBe('---\nname: reviewer\n---\nbody');
  });

  it('prunes cruft', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('reviewer.md', 'x'), file('__pycache__/foo.pyc'), file('Thumbs.db')];
    const subagent = assertSubagentArchive({ manifest, files });
    expect(subagent.doc.toString()).toBe('x');
  });

  it('throws when subagent file is missing', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json')];
    expect(() => assertSubagentArchive({ manifest, files })).toThrow(/missing required file: reviewer\.md/);
  });

  it('throws on disallowed extra files', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('reviewer.md'), file('config.yaml')];
    expect(() => assertSubagentArchive({ manifest, files })).toThrow(/disallowed file: config\.yaml/);
  });
});

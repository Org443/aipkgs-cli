import { describe, expect, it } from 'vitest';
import { compileIgnore } from '../ignore.ts';

function ignored(patterns: string[], relPath: string, isDir = false) {
  return compileIgnore({ patterns }).matches({ relPath, isDir });
}

describe('compileIgnore', () => {
  it('excludes nothing for an empty ruleset', () => {
    expect(ignored([], 'anything.txt')).toBe(false);
  });

  it('drops blank lines and # comments', () => {
    const patterns = ['', '   ', '# a comment', 'secret.txt'];
    expect(ignored(patterns, 'secret.txt')).toBe(true);
    expect(ignored(patterns, 'keep.txt')).toBe(false);
  });

  it('matches a slash-free name at any depth', () => {
    expect(ignored(['notes.md'], 'notes.md')).toBe(true);
    expect(ignored(['notes.md'], 'deep/dir/notes.md')).toBe(true);
    expect(ignored(['notes.md'], 'notes.md.bak')).toBe(false);
  });

  it('anchors a pattern containing a slash to the root', () => {
    expect(ignored(['docs/tmp.md'], 'docs/tmp.md')).toBe(true);
    expect(ignored(['docs/tmp.md'], 'a/docs/tmp.md')).toBe(false);
  });

  it('treats a leading slash as root-anchored', () => {
    expect(ignored(['/scripts.md'], 'scripts.md')).toBe(true);
    expect(ignored(['/scripts.md'], 'nested/scripts.md')).toBe(false);
  });

  describe('directory-only patterns (trailing slash)', () => {
    it('matches a directory but not a file of the same name', () => {
      expect(ignored(['cache/'], 'cache', true)).toBe(true);
      expect(ignored(['cache/'], 'cache', false)).toBe(false);
    });
  });

  describe('globs', () => {
    it('* stays within a segment', () => {
      expect(ignored(['*.log'], 'debug.log')).toBe(true);
      expect(ignored(['*.log'], 'logs/debug.log')).toBe(true);
      expect(ignored(['build/*.js'], 'build/app.js')).toBe(true);
      expect(ignored(['build/*.js'], 'build/nested/app.js')).toBe(false);
    });

    it('** crosses segments', () => {
      expect(ignored(['build/**'], 'build/nested/app.js')).toBe(true);
    });
  });
});

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isENOENT } from '@local/archive';

// Authors drop an `.aipkgignore` at the package root to keep stray files out of
// the published archive. It matters most for skills, whose layout is arbitrary —
// without an allowlist, an accidental `.env`, scratch note, or local fixture
// would otherwise be swept in by the walk-everything collect.
export const IGNORE_FILENAME = '.aipkgignore';

// A compiled `.aipkgignore`. `matches` answers "should this entry be excluded?"
// for both files (skip the entry) and directories (skip the descent — which
// excludes everything nested beneath it). An empty/missing ignore file yields a
// matcher that excludes nothing.
export type Ignore = { matches(args: { relPath: string; isDir: boolean }): boolean };

// Load and compile the package's `.aipkgignore`. A missing file is not an error —
// it just means nothing is ignored.
export async function loadIgnore(args: { dir: string }): Promise<Ignore> {
  const { dir } = args;

  let text: string;
  try {
    text = await readFile(join(dir, IGNORE_FILENAME), 'utf8');
  } catch (err) {
    if (isENOENT(err)) return compileIgnore({ patterns: [] });
    throw err;
  }

  const patterns = text.split('\n');
  return compileIgnore({ patterns });
}

// Compile raw `.aipkgignore` lines into a matcher. Supported gitignore subset:
// blank lines and `#` comments are dropped; a trailing `/` marks a
// directory-only pattern (won't match a plain file of that name); a pattern
// containing a slash is anchored to the package root, while a slash-free pattern
// matches that basename at any depth; `*` matches within a path segment and `**`
// across segments. Excluding a directory excludes everything under it, since the
// walker stops descending. Negation (`!`) is intentionally unsupported.
export function compileIgnore(args: { patterns: string[] }): Ignore {
  const { patterns } = args;

  const rules = patterns
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map(compileRule);

  return {
    matches({ relPath, isDir }) {
      const normalized = relPath.split(/[\\/]/).join('/');
      return rules.some((rule) => rule.matches({ path: normalized, isDir }));
    },
  };
}

////
/// Helpers
//

// Turn a single ignore line into a predicate over a normalized POSIX path.
function compileRule(rawPattern: string): { matches(args: { path: string; isDir: boolean }): boolean } {
  let pattern = rawPattern;

  const dirOnly = pattern.endsWith('/');
  if (dirOnly) pattern = pattern.slice(0, -1);

  const anchored = pattern.startsWith('/');
  if (anchored) pattern = pattern.slice(1);

  // A slash-free, unanchored pattern matches that basename at any depth
  // (gitignore treats `node_modules` as "any segment named node_modules"); a
  // pattern with a slash — or an explicit leading-slash anchor — is rooted and
  // tested against the whole path.
  const bareName = !anchored && !pattern.includes('/');
  const regex = globToRegex(pattern);

  return {
    matches({ path, isDir }) {
      if (dirOnly && !isDir) return false;
      const candidates = bareName ? path.split('/') : [path];
      return candidates.some((candidate) => regex.test(candidate));
    },
  };
}

// Convert a glob pattern to an anchored RegExp. `**` matches across segments,
// `*` matches within a single segment, `?` matches one non-slash char.
function globToRegex(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i++;
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else if (ch && '\\^$.|+()[]{}'.includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  return new RegExp(`^${out}$`);
}

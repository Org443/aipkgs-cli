import { InvalidArchive } from '../errors.ts';
import { MANIFEST_FILENAME, type Manifest } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';
import { pruneCruft } from './prune.ts';
import { HERO_CARD_FILENAME, LICENSE_FILENAME, README_FILENAME } from './shared.ts';

const BOX_ROOT_FILES = new Set([MANIFEST_FILENAME, README_FILENAME, HERO_CARD_FILENAME, LICENSE_FILENAME]);
const FLAT_DEP_DIRS = new Set(['cmds', 'subagents', 'rules']);

export function assertBoxArchive(args: { manifest: Manifest; files: TarEntry[] }): { files: TarEntry[] } {
  const { files } = args;

  const pruned = pruneCruft(files);

  for (const file of pruned) {
    if (BOX_ROOT_FILES.has(file.path)) continue;

    const [top, ...rest] = file.path.split('/');

    if (top === 'skills') {
      // skills/<slug>/<anything…> — at least one file under a slug dir.
      if (rest.length >= 2 && rest[0] && rest[rest.length - 1]) continue;
    } else if (top && FLAT_DEP_DIRS.has(top)) {
      // cmds|subagents|rules/<name>.md — single .md, no nesting.
      if (rest.length === 1 && rest[0]?.endsWith('.md')) continue;
    }

    throw new InvalidArchive({ message: `box archive contains disallowed file: ${file.path}` });
  }

  return { files: pruned };
}

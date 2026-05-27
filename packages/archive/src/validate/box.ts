import { InvalidArchive } from '../errors.ts';
import { MANIFEST_FILENAME, type Manifest } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';
import { HOOKS_JSON_FILENAME } from './hook.ts';
import { pruneCruft } from './prune.ts';
import { HERO_CARD_FILENAME, LICENSE_FILENAME, README_FILENAME } from './shared.ts';

const BOX_ROOT_FILES = new Set([MANIFEST_FILENAME, README_FILENAME, HERO_CARD_FILENAME, LICENSE_FILENAME]);
const FLAT_DEP_DIRS = new Set(['cmds', 'subagents', 'rules']);
const HOOKS_DIR = 'hooks';

export function assertBoxArchive(args: { manifest: Manifest; files: TarEntry[] }): { files: TarEntry[] } {
  const { files } = args;

  const pruned = pruneCruft(files);

  let hasHookFiles = false;

  for (const file of pruned) {
    if (BOX_ROOT_FILES.has(file.path)) continue;

    const [top, ...rest] = file.path.split('/');

    if (top === 'skills') {
      // skills/<slug>/<anything…> — at least one file under a slug dir.
      if (rest.length >= 2 && rest[0] && rest[rest.length - 1]) continue;
    } else if (top === HOOKS_DIR) {
      // hooks/<anything…> — flat layout, no slug. The hooks/ dir is itself
      // the hook bundle (mirrors a standalone hook archive).
      if (rest.length >= 1 && rest[rest.length - 1]) {
        hasHookFiles = true;
        continue;
      }
    } else if (top && FLAT_DEP_DIRS.has(top)) {
      // cmds|subagents|rules/<name>.md — single .md, no nesting.
      if (rest.length === 1 && rest[0]?.endsWith('.md')) continue;
    }

    throw new InvalidArchive({ message: `box archive contains disallowed file: ${file.path}` });
  }

  if (hasHookFiles) {
    const hooksJsonPath = `${HOOKS_DIR}/${HOOKS_JSON_FILENAME}`;
    const hasHooksJson = pruned.some((f) => f.path === hooksJsonPath);
    if (!hasHooksJson) {
      throw new InvalidArchive({ message: `box archive missing required file: ${hooksJsonPath}` });
    }
  }

  return { files: pruned };
}

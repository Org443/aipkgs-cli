import { InvalidArchive } from '../errors.ts';
import type { Manifest } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';
import { pruneCruft } from './prune.ts';
import { assertRequiredFile } from './shared.ts';

export const HOOKS_JSON_FILENAME = 'hooks.json';

export function assertHookArchive(args: {
  manifest: Manifest;
  files: TarEntry[];
}): { files: TarEntry[] } {
  const { files } = args;

  const pruned = pruneCruft(files);

  assertRequiredFile({ files: pruned, path: HOOKS_JSON_FILENAME, archiveType: 'hook' });

  const hooksEntry = pruned.find((f) => f.path === HOOKS_JSON_FILENAME);
  if (hooksEntry) {
    try {
      JSON.parse(hooksEntry.body.toString());
    } catch (err) {
      throw new InvalidArchive({
        message: `hook archive ${HOOKS_JSON_FILENAME} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return { files: pruned };
}

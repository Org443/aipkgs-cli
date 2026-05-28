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
    let parsed: unknown;
    try {
      parsed = JSON.parse(hooksEntry.body.toString());
    } catch (err) {
      throw new InvalidArchive({
        message: `hook archive ${HOOKS_JSON_FILENAME} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    assertStatusLineShape(parsed);
  }

  return { files: pruned };
}

function assertStatusLineShape(parsed: unknown) {
  if (!isPlainObject(parsed)) return;
  if (!('statusLine' in parsed)) return;

  const extraKeys = Object.keys(parsed).filter((k) => k !== 'hooks' && k !== 'statusLine');
  if (extraKeys.length > 0) {
    throw new InvalidArchive({
      message: `hook archive ${HOOKS_JSON_FILENAME}: statusLine is only allowed inside the wrapper shape ({ "hooks": {...}, "statusLine": {...} }), not alongside a bare event map`,
    });
  }

  if (!isPlainObject(parsed.statusLine)) {
    throw new InvalidArchive({
      message: `hook archive ${HOOKS_JSON_FILENAME}: statusLine must be a JSON object`,
    });
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

import { InvalidArchive } from '../errors.ts';
import { MANIFEST_FILENAME } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';

export const LICENSE_FILENAME = 'LICENSE.txt';
export const README_FILENAME = 'README.md';

export const FLAT_ASSET_ALLOWED_SIBLINGS = new Set([MANIFEST_FILENAME, LICENSE_FILENAME, README_FILENAME]);

// Files that are neither the manifest nor a metadata sidecar — the package's own
// payload, used to build a decoded grouping (a setup bundle's `scripts`, a
// skill's `assets`). `README.md` and `LICENSE.txt` are optional metadata
// siblings allowed in every archive type and are excluded here so each grouping
// means just the package's own content.
export function isPayloadFile(path: string): boolean {
  return path !== MANIFEST_FILENAME && path !== README_FILENAME && path !== LICENSE_FILENAME;
}

export function assertRequiredFile(args: { files: TarEntry[]; path: string; archiveType: string }) {
  const { files, path, archiveType } = args;
  const found = files.find((file) => file.path === path);
  if (!found) {
    throw new InvalidArchive({ message: `${archiveType} archive missing required file: ${path}` });
  }

  return found;
}

export function assertOnlyAllowedFiles(args: {
  files: TarEntry[];
  allowed: Set<string>;
  archiveType: string;
}) {
  const { files, allowed, archiveType } = args;
  for (const file of files) {
    if (!allowed.has(file.path)) {
      throw new InvalidArchive({
        message: `${archiveType} archive contains disallowed file: ${file.path}`,
      });
    }
  }
}

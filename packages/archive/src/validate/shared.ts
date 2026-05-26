import { InvalidArchive } from '../errors.ts';
import { MANIFEST_FILENAME } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';

export const HERO_CARD_FILENAME = 'HERO_CARD.md';
export const LICENSE_FILENAME = 'LICENSE.txt';
export const README_FILENAME = 'README.md';

export const FLAT_ASSET_ALLOWED_SIBLINGS = new Set([
  MANIFEST_FILENAME,
  HERO_CARD_FILENAME,
  LICENSE_FILENAME,
  README_FILENAME,
]);

export function assertRequiredFile(args: { files: TarEntry[]; path: string; archiveType: string }) {
  const { files, path, archiveType } = args;
  const found = files.some((file) => file.path === path);
  if (!found) {
    throw new InvalidArchive({ message: `${archiveType} archive missing required file: ${path}` });
  }
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

import type { Manifest } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';
import { pruneCruft } from './prune.ts';
import { FLAT_ASSET_ALLOWED_SIBLINGS, assertOnlyAllowedFiles, assertRequiredFile } from './shared.ts';

export function assertCmdArchive(args: { manifest: Manifest; files: TarEntry[] }): { files: TarEntry[] } {
  const { manifest, files } = args;
  const { slug } = manifest.pkgRef;
  const cmdFile = `${slug}.md`;

  const pruned = pruneCruft(files);

  assertRequiredFile({ files: pruned, path: cmdFile, archiveType: 'cmd' });

  const allowed = new Set([...FLAT_ASSET_ALLOWED_SIBLINGS, cmdFile]);
  assertOnlyAllowedFiles({ files: pruned, allowed, archiveType: 'cmd' });

  return { files: pruned };
}

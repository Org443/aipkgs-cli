import type { Manifest } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';
import { pruneCruft } from './prune.ts';
import { FLAT_ASSET_ALLOWED_SIBLINGS, assertOnlyAllowedFiles, assertRequiredFile } from './shared.ts';

export function assertSubagentArchive(args: {
  manifest: Manifest;
  files: TarEntry[];
}): { files: TarEntry[] } {
  const { manifest, files } = args;
  const { slug } = manifest.pkgRef;
  const subagentFile = `${slug}.md`;

  const pruned = pruneCruft(files);

  assertRequiredFile({ files: pruned, path: subagentFile, archiveType: 'subagent' });

  const allowed = new Set([...FLAT_ASSET_ALLOWED_SIBLINGS, subagentFile]);
  assertOnlyAllowedFiles({ files: pruned, allowed, archiveType: 'subagent' });

  return { files: pruned };
}

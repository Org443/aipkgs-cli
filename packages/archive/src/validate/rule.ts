import type { Manifest } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';
import { pruneCruft } from './prune.ts';
import { FLAT_ASSET_ALLOWED_SIBLINGS, assertOnlyAllowedFiles, assertRequiredFile } from './shared.ts';

export function assertRuleArchive(args: { manifest: Manifest; files: TarEntry[] }): { files: TarEntry[] } {
  const { manifest, files } = args;
  const { slug } = manifest.pkgRef;
  const ruleFile = `${slug}.md`;

  const pruned = pruneCruft(files);

  assertRequiredFile({ files: pruned, path: ruleFile, archiveType: 'rule' });

  const allowed = new Set([...FLAT_ASSET_ALLOWED_SIBLINGS, ruleFile]);
  assertOnlyAllowedFiles({ files: pruned, allowed, archiveType: 'rule' });

  return { files: pruned };
}

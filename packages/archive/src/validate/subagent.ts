import { InvalidArchive } from '../errors.ts';
import type { Manifest } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';
import { pruneCruft } from './prune.ts';
import { FLAT_ASSET_ALLOWED_SIBLINGS, assertOnlyAllowedFiles, assertRequiredFile } from './shared.ts';

// A subagent decoded into the universal archive shape: its slug and the markdown
// body. The on-disk `<slug>.md` filename is reconstructed from the slug at
// install time, so only the body is carried here.
export type ArchiveSubagent = { slug: string; doc: Buffer };

export function assertSubagentArchive(args: { manifest: Manifest; files: TarEntry[] }): ArchiveSubagent {
  const { manifest, files } = args;
  return parseSubagent({ slug: manifest.pkgRef.slug, files });
}

// Validate a flat subagent layout (`<slug>.md` plus optional metadata siblings)
// and return its decoded form. Reused by the box validator, which passes each
// child subagent's re-rooted files and its own slug.
export function parseSubagent(args: { slug: string; files: TarEntry[] }): ArchiveSubagent {
  const { slug, files } = args;
  const subagentFile = `${slug}.md`;

  const pruned = pruneCruft(files);

  assertRequiredFile({ files: pruned, path: subagentFile, archiveType: 'subagent' });

  const allowed = new Set([...FLAT_ASSET_ALLOWED_SIBLINGS, subagentFile]);
  assertOnlyAllowedFiles({ files: pruned, allowed, archiveType: 'subagent' });

  const doc = pruned.find((f) => f.path === subagentFile);
  if (!doc) throw new InvalidArchive({ message: `subagent archive missing required file: ${subagentFile}` });

  return { slug, doc: doc.body };
}

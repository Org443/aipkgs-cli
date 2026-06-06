import { InvalidArchive } from '../errors.ts';
import type { Manifest } from '../manifest.ts';
import type { TarEntry } from '../tarball.ts';
import { pruneCruft } from './prune.ts';
import { FLAT_ASSET_ALLOWED_SIBLINGS, assertOnlyAllowedFiles, assertRequiredFile } from './shared.ts';

// A rule decoded into the universal archive shape: its slug and the markdown
// body. The on-disk `<slug>.md` filename is reconstructed from the slug at
// install time, so only the body is carried here.
export type ArchiveRule = { slug: string; doc: Buffer };

export function assertRuleArchive(args: { manifest: Manifest; files: TarEntry[] }): ArchiveRule {
  const { manifest, files } = args;
  return parseRule({ slug: manifest.pkgRef.slug, files });
}

// Validate a flat rule layout (`<slug>.md` plus optional metadata siblings) and
// return its decoded form. Reused by the box validator, which passes each child
// rule's re-rooted files and its own slug.
export function parseRule(args: { slug: string; files: TarEntry[] }): ArchiveRule {
  const { slug, files } = args;
  const ruleFile = `${slug}.md`;

  const pruned = pruneCruft(files);

  assertRequiredFile({ files: pruned, path: ruleFile, archiveType: 'rule' });

  const allowed = new Set([...FLAT_ASSET_ALLOWED_SIBLINGS, ruleFile]);
  assertOnlyAllowedFiles({ files: pruned, allowed, archiveType: 'rule' });

  const doc = pruned.find((f) => f.path === ruleFile);
  if (!doc) throw new InvalidArchive({ message: `rule archive missing required file: ${ruleFile}` });

  return { slug, doc: doc.body };
}

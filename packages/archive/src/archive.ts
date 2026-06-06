import { createHash } from 'node:crypto';
import { MANIFEST_TYPES } from './constants.ts';
import { InvalidArchive, InvalidManifest } from './errors.ts';
import { MANIFEST_FILENAME, Manifest } from './manifest.ts';
import type { PackageRef } from './ref.ts';
import { withSetupFeatureTags } from './setup-features.ts';
import { type TarEntry, tarballService } from './tarball.ts';
import { assertBoxArchive } from './validate/box.ts';
import { pruneCruft } from './validate/prune.ts';
import { type ArchiveRule, assertRuleArchive } from './validate/rule.ts';
import { type ArchiveSetup, assertSetupArchive } from './validate/setup.ts';
import { LICENSE_FILENAME, README_FILENAME } from './validate/shared.ts';
import { type ArchiveSkill, assertSkillArchive } from './validate/skill.ts';
import { type ArchiveSubagent, assertSubagentArchive } from './validate/subagent.ts';

// A universal, in-memory copy of an archive. Every archive type — box or a
// standalone rule/subagent/skill/setup — is asserted against its own layout and
// then decoded into this single shape, so consumers read the same grouped fields
// regardless of how the package was authored. A standalone archive yields a
// single-element array for its type (or the lone `setup`); a box yields many.
export type AIpkgArchive = {
  manifest: Manifest;
  pkgRef: PackageRef;
  sha: string;
  // Every raw tar entry from the archive, exactly as unwrapped (manifest
  // included). This is the undecoded, byte-level view kept alongside the decoded
  // groupings below, so consumers that need the original files — committing the
  // exploded `files/<path>` objects to the registry, mirroring an install to
  // `.aipkgs/` — read them here instead of re-unwrapping the tarball.
  files: TarEntry[];
  rules: ArchiveRule[];
  subagents: ArchiveSubagent[];
  skills: ArchiveSkill[];
  setup?: ArchiveSetup;
  // The root `README.md` / `LICENSE.txt`, decoded to text. Optional metadata
  // siblings allowed in every archive type and kept out of the functional
  // groupings.
  readme?: string;
  license?: string;
};

// The decoded groupings of an archive, before the manifest/sha envelope is added.
type ArchiveDecoded = Pick<AIpkgArchive, 'rules' | 'subagents' | 'skills' | 'setup'>;

export const archiveService = {
  async parse(raw: Buffer): Promise<AIpkgArchive> {
    const { files } = await tarballService.unwrap(raw);

    const manifestEntry = files.find((file) => file.path === MANIFEST_FILENAME);
    if (!manifestEntry) throw new InvalidArchive({ message: 'manifest not found in archive' });

    const manifest = new Manifest({ text: manifestEntry.body.toString() });

    const decoded = assertArchive({ manifest, files });

    if (decoded.setup) {
      manifest.tags = withSetupFeatureTags({ tags: manifest.tags, setup: decoded.setup });
    }

    const hash = sha256hex(raw);
    const { pkgRef } = manifest;
    const readme = files.find((f) => f.path === README_FILENAME)?.body.toString();
    const license = files.find((f) => f.path === LICENSE_FILENAME)?.body.toString();

    return { manifest, pkgRef, sha: `sha256:${hash}`, files, readme, license, ...decoded };
  },

  async pack(args: { manifest: Manifest; files: TarEntry[] }) {
    const { manifest, files: inputFiles } = args;

    const manifestEntry: TarEntry = {
      path: MANIFEST_FILENAME,
      body: Buffer.from(JSON.stringify(manifest.toObject())),
    };

    const files = pruneCruft([manifestEntry, ...inputFiles]);
    assertArchive({ manifest, files });

    const tgz = await tarballService.pack(files);

    return { tgz };
  },
  assert(args: { manifest: Manifest; files: TarEntry[] }): ArchiveDecoded {
    return assertArchive(args);
  },
};

function assertArchive(args: { manifest: Manifest; files: TarEntry[] }): ArchiveDecoded {
  const { manifest, files } = args;
  const { type } = manifest;
  assertType(type);

  const empty: ArchiveDecoded = { rules: [], subagents: [], skills: [] };

  switch (type) {
    case 'box':
      return { ...empty, ...assertBoxArchive({ manifest, files }) };
    case 'skill':
      return { ...empty, skills: [assertSkillArchive({ manifest, files })] };
    case 'subagent':
      return { ...empty, subagents: [assertSubagentArchive({ manifest, files })] };
    case 'rule':
      return { ...empty, rules: [assertRuleArchive({ manifest, files })] };
    case 'setup':
      return { ...empty, setup: assertSetupArchive({ manifest, files }) };
    default:
      throw new InvalidArchive({ message: `invalid package type: ${type}` });
  }
}

function sha256hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function assertType(type: string): type is Manifest['type'] {
  if (!MANIFEST_TYPES.includes(type as Manifest['type'])) {
    throw new InvalidManifest({ message: `Manifest type must be one of: ${MANIFEST_TYPES.join(', ')}` });
  }
  return true;
}

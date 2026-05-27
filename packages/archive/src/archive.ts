import { createHash } from 'node:crypto';
import { MANIFEST_TYPES } from './constants.ts';
import { InvalidArchive, InvalidManifest } from './errors.ts';
import { MANIFEST_FILENAME, Manifest } from './manifest.ts';
import type { PackageRef } from './ref.ts';
import { type TarEntry, tarballService } from './tarball.ts';
import { assertBoxArchive } from './validate/box.ts';
import { assertCmdArchive } from './validate/cmd.ts';
import { assertHookArchive } from './validate/hook.ts';
import { assertRuleArchive } from './validate/rule.ts';
import { assertSkillArchive } from './validate/skill.ts';
import { assertSubagentArchive } from './validate/subagent.ts';

export type AIpkgArchive = {
  manifest: Manifest;
  files: TarEntry[];
  sha: string;
  version: string;
  raw: Buffer;
  pkgRef: PackageRef;
};

export const archiveService = {
  async parse(raw: Buffer): Promise<AIpkgArchive> {
    const { files: rawFiles } = await tarballService.unwrap(raw);

    const manifestEntry = rawFiles.find((file) => file.path === MANIFEST_FILENAME);
    if (!manifestEntry) throw new InvalidArchive({ message: 'manifest not found in archive' });

    const manifest = new Manifest({ text: manifestEntry.body.toString() });

    const { files } = assertArchive({ manifest, files: rawFiles });

    const hash = sha256hex(raw);
    const { pkgRef } = manifest;

    return { manifest, files, sha: `sha256:${hash}`, version: manifest.version, raw, pkgRef };
  },

  async pack(args: { manifest: Manifest; files: TarEntry[] }) {
    const { manifest, files: inputFiles } = args;

    const manifestEntry: TarEntry = {
      path: MANIFEST_FILENAME,
      body: Buffer.from(JSON.stringify(manifest.toObject())),
    };

    const { files: validated } = assertArchive({
      manifest,
      files: [manifestEntry, ...inputFiles],
    });

    const tgz = await tarballService.pack(validated);

    return { tgz };
  },
};

function assertArchive(args: { manifest: Manifest; files: TarEntry[] }): { files: TarEntry[] } {
  const { manifest, files } = args;
  const { type } = manifest;
  assertType(type);

  switch (type) {
    case 'box':
      return assertBoxArchive({ manifest, files });
    case 'cmd':
      return assertCmdArchive({ manifest, files });
    case 'skill':
      return assertSkillArchive({ manifest, files });
    case 'subagent':
      return assertSubagentArchive({ manifest, files });
    case 'rule':
      return assertRuleArchive({ manifest, files });
    case 'hook':
      return assertHookArchive({ manifest, files });

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

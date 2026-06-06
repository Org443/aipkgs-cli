import { describe, expect, it } from 'vitest';
import { archiveService } from '../archive.ts';
import { MANIFEST_FILENAME, Manifest } from '../manifest.ts';
import { tarballService } from '../tarball.ts';

describe('archiveService.pack()', () => {
  it('writes only schema fields to aipkg.json (no instance-only `pkgRef`)', async () => {
    const manifest = new Manifest({
      type: 'rule',
      ref: 'acme/style/lint',
      version: '1.2.3',
      description: 'a rule',
      targets: ['claude'],
    });

    const { tgz } = await archiveService.pack({
      manifest,
      files: [{ path: 'lint.md', body: Buffer.from('# lint\n') }],
    });

    const { files } = await tarballService.unwrap(tgz);
    const manifestEntry = files.find((f) => f.path === MANIFEST_FILENAME);
    expect(manifestEntry).toBeDefined();

    const parsed = JSON.parse(manifestEntry?.body.toString('utf8') ?? '{}');

    // The instance carries a synthesized `pkgRef`. It must not be serialized
    // into the on-disk manifest — only the ManifestZ schema fields belong.
    expect(parsed).not.toHaveProperty('pkgRef');
    expect(Object.keys(parsed).sort()).toEqual(['description', 'ref', 'targets', 'type', 'version']);
    expect(parsed).toMatchObject({
      type: 'rule',
      ref: 'acme/style/lint',
      version: '1.2.3',
      description: 'a rule',
      targets: ['claude'],
    });
  });

  it('packed manifest round-trips back through archiveService.parse', async () => {
    const manifest = new Manifest({
      type: 'rule',
      ref: 'acme/johns/pr-create',
      version: '0.4.2',
      targets: ['claude', 'codex'],
    });

    const { tgz } = await archiveService.pack({
      manifest,
      files: [{ path: 'pr-create.md', body: Buffer.from('# pr-create\n') }],
    });

    const archive = await archiveService.parse(tgz);
    expect(archive.manifest.toObject()).toEqual(manifest.toObject());
  });
});

describe('archiveService.parse() sidecars', () => {
  it('surfaces README.md and LICENSE.txt as string docs', async () => {
    const manifest = new Manifest({ type: 'rule', ref: 'acme/style/lint', version: '1.0.0' });
    const { tgz } = await archiveService.pack({
      manifest,
      files: [
        { path: 'lint.md', body: Buffer.from('# lint\n') },
        { path: 'README.md', body: Buffer.from('# readme\n') },
        { path: 'LICENSE.txt', body: Buffer.from('MIT\n') },
      ],
    });

    const archive = await archiveService.parse(tgz);
    expect(archive.readme).toBe('# readme\n');
    expect(archive.license).toBe('MIT\n');
  });

  it('leaves readme/license undefined when absent', async () => {
    const manifest = new Manifest({ type: 'rule', ref: 'acme/style/lint', version: '1.0.0' });
    const { tgz } = await archiveService.pack({
      manifest,
      files: [{ path: 'lint.md', body: Buffer.from('x') }],
    });

    const archive = await archiveService.parse(tgz);
    expect(archive.readme).toBeUndefined();
    expect(archive.license).toBeUndefined();
  });
});

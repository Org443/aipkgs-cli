import { describe, expect, it } from 'vitest';
import { tarballService } from '../tarball.ts';

describe('tarballService', () => {
  it('round-trips the executable bit through pack/unwrap', async () => {
    const tgz = await tarballService.pack([
      { path: 'scripts/run.sh', body: Buffer.from('#!/bin/sh\n'), executable: true },
      { path: 'README.md', body: Buffer.from('# readme\n') },
    ]);

    const { files } = await tarballService.unwrap(tgz);

    expect(files).toMatchObject([
      { path: 'scripts/run.sh', executable: true },
      { path: 'README.md', executable: false },
    ]);
  });
});

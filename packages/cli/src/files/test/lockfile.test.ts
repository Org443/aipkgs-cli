import { PackageRef } from '@local/archive';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupTestCwd, teardownTestCwd, writeTestFile } from '../../test/helpers.ts';
import { Lockfile } from '../lockfile.ts';

beforeEach(() => {
  setupTestCwd({ prefix: 'aipkg-lockfile-test-' });
});

afterEach(() => {
  teardownTestCwd();
});

describe('Lockfile.resolvePkgRef', () => {
  it('returns the input pkgRef unchanged when no lock entry exists', async () => {
    await writeTestFile(JSON.stringify({ deps: {} }), 'aipkg.lock');
    const lockfile = await Lockfile.resolve();

    const pkgRef = new PackageRef({ refStr: 'skill/org/foo@latest' });
    const result = lockfile.resolvePkgRef({ pkgRef });

    expect(result).toBe(pkgRef);
  });

  it('returns a PackageRef derived from the lock entry when present', async () => {
    await writeTestFile(
      JSON.stringify({
        deps: {
          skills: {
            foo: {
              aipkgRef: 'aipkg://skill/org/foo@0.1.5',
              version: '0.1.5',
              sha: 'sha256:abc',
            },
          },
        },
      }),
      'aipkg.lock',
    );
    const lockfile = await Lockfile.resolve();

    const pkgRef = new PackageRef({ refStr: 'skill/org/foo@latest' });
    const result = lockfile.resolvePkgRef({ pkgRef });

    expect(result.aipkgRef).toBe('aipkg://skill/org/foo@0.1.5');
    expect(result.version).toBe('0.1.5');
  });
});

describe('Lockfile.upsertStatusLine / removeStatusLine / getStatusLine', () => {
  async function emptyLock() {
    await writeTestFile(JSON.stringify({ deps: {} }), 'aipkg.lock');
    return Lockfile.resolve();
  }

  it('stores a statusLine when none exists', async () => {
    const lockfile = await emptyLock();
    lockfile.upsertStatusLine({ slug: 'lint', statusLine: { type: 'command', command: 'a.sh' } });
    expect(lockfile.getStatusLine()).toMatchObject({
      slug: 'lint',
      statusLine: { type: 'command', command: 'a.sh' },
    });
  });

  it('is idempotent for the same slug and same statusLine', async () => {
    const lockfile = await emptyLock();
    lockfile.upsertStatusLine({ slug: 'lint', statusLine: { command: 'a.sh' } });
    expect(() => lockfile.upsertStatusLine({ slug: 'lint', statusLine: { command: 'a.sh' } })).not.toThrow();
  });

  it('throws when a different slug claims the statusLine', async () => {
    const lockfile = await emptyLock();
    lockfile.upsertStatusLine({ slug: 'lint', statusLine: { command: 'a.sh' } });
    expect(() => lockfile.upsertStatusLine({ slug: 'fmt', statusLine: { command: 'a.sh' } })).toThrow(
      /statusLine conflict/,
    );
  });

  it('throws when the same slug supplies a different statusLine', async () => {
    const lockfile = await emptyLock();
    lockfile.upsertStatusLine({ slug: 'lint', statusLine: { command: 'a.sh' } });
    expect(() => lockfile.upsertStatusLine({ slug: 'lint', statusLine: { command: 'b.sh' } })).toThrow(
      /statusLine conflict/,
    );
  });

  it('removeStatusLine only removes when the slug owns it', async () => {
    const lockfile = await emptyLock();
    lockfile.upsertStatusLine({ slug: 'lint', statusLine: { command: 'a.sh' } });
    expect(lockfile.removeStatusLine({ slug: 'fmt' })).toBe(false);
    expect(lockfile.getStatusLine()).toBeDefined();
    expect(lockfile.removeStatusLine({ slug: 'lint' })).toBe(true);
    expect(lockfile.getStatusLine()).toBeUndefined();
  });
});

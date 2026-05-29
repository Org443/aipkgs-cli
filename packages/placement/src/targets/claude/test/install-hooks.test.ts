import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTestArchive,
  readTestFile,
  readTestJson,
  setupTestCwd,
  teardownTestCwd,
  testFileExists,
} from '../../../test/helpers.ts';
import { install, installFiles, remove } from '../install.ts';
import { settingsConfig } from '../settings-config.ts';

beforeEach(() => setupTestCwd({ prefix: 'aipkg-claude-install-hooks-' }));
afterEach(teardownTestCwd);

const HOOKS_JSON = JSON.stringify({
  PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/lint.sh' }] }],
});

describe('install (hook)', () => {
  it('places hook files under .claude/hooks/<slug>/ and merges hooks.json into settings.local.json', async () => {
    const archive = await buildTestArchive({
      type: 'hook',
      slug: 'lint',
      files: [
        { path: 'hooks.json', body: Buffer.from(HOOKS_JSON) },
        { path: 'scripts/lint.sh', body: Buffer.from('#!/bin/sh\necho lint\n') },
        { path: 'README.md', body: Buffer.from('docs') },
      ],
    });

    const { written } = await install({ archive, slug: 'lint' });

    expect(written).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\.claude\/hooks\/lint\/scripts\/lint\.sh$/),
        expect.stringMatching(/\.claude\/hooks\/lint\/README\.md$/),
        expect.stringMatching(/\.claude\/settings\.local\.json$/),
      ]),
    );

    expect(await readTestFile('.claude', 'hooks', 'lint', 'scripts', 'lint.sh')).toBe('#!/bin/sh\necho lint\n');
    expect(await readTestFile('.claude', 'hooks', 'lint', 'README.md')).toBe('docs');
    expect(testFileExists('.claude', 'hooks', 'lint', 'hooks.json')).toBe(false);

    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings).toMatchObject({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'scripts/lint.sh' }],
            __aipkg: 'lint',
          },
        ],
      },
    });
  });

  it('returns the parsed statusLine without writing it to settings', async () => {
    const archive = await buildTestArchive({
      type: 'hook',
      slug: 'lint',
      files: [
        {
          path: 'hooks.json',
          body: Buffer.from(
            JSON.stringify({
              hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'lint.sh' }] }] },
              statusLine: { type: 'command', command: 'status.sh' },
            }),
          ),
        },
      ],
    });

    const result = await install({ archive, slug: 'lint' });

    expect((result as any).statusLine).toMatchObject({ type: 'command', command: 'status.sh' });

    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.statusLine).toBeUndefined();
    expect(settings.hooks.PreToolUse).toHaveLength(1);
  });

  it('merges hooks for multiple slugs without clobbering prior entries', async () => {
    const lintArchive = await buildTestArchive({
      type: 'hook',
      slug: 'lint',
      files: [{ path: 'hooks.json', body: Buffer.from(HOOKS_JSON) }],
    });
    const fmtArchive = await buildTestArchive({
      type: 'hook',
      slug: 'fmt',
      files: [
        {
          path: 'hooks.json',
          body: Buffer.from(
            JSON.stringify({
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'fmt' }] }],
            }),
          ),
        },
      ],
    });

    await install({ archive: lintArchive, slug: 'lint' });
    await install({ archive: fmtArchive, slug: 'fmt' });

    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks.PreToolUse).toHaveLength(2);
    expect(settings.hooks.PreToolUse.map((m: { __aipkg: string }) => m.__aipkg).sort()).toEqual(['fmt', 'lint']);
  });

  it('replaces previous matchers for the same slug on reinstall', async () => {
    const first = await buildTestArchive({
      type: 'hook',
      slug: 'lint',
      files: [{ path: 'hooks.json', body: Buffer.from(HOOKS_JSON) }],
    });
    await install({ archive: first, slug: 'lint' });

    const second = await buildTestArchive({
      type: 'hook',
      slug: 'lint',
      files: [
        {
          path: 'hooks.json',
          body: Buffer.from(
            JSON.stringify({
              PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'scripts/lint-v2.sh' }] }],
            }),
          ),
        },
      ],
    });
    await install({ archive: second, slug: 'lint' });

    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0]).toMatchObject({
      matcher: 'Edit',
      hooks: [{ command: 'scripts/lint-v2.sh' }],
      __aipkg: 'lint',
    });
  });

  it('throws when hooks.json is missing from the file set', async () => {
    await expect(
      installFiles({
        type: 'hook',
        slug: 'lint',
        files: [{ path: 'scripts/lint.sh', body: Buffer.from('#!/bin/sh\n') }],
      }),
    ).rejects.toThrow(/missing hooks\.json/);
  });

  it('throws when hooks.json contains invalid JSON', async () => {
    await expect(
      installFiles({
        type: 'hook',
        slug: 'lint',
        files: [{ path: 'hooks.json', body: Buffer.from('not-json{') }],
      }),
    ).rejects.toThrow(/not valid JSON/);
  });

  it('accepts the settings.json wrapper shape ({ hooks: { ... } })', async () => {
    const archive = await buildTestArchive({
      type: 'hook',
      slug: 'lint',
      files: [
        {
          path: 'hooks.json',
          body: Buffer.from(
            JSON.stringify({
              hooks: {
                PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/lint.sh' }] }],
              },
            }),
          ),
        },
      ],
    });

    await install({ archive, slug: 'lint' });

    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0]).toMatchObject({ matcher: 'Bash', __aipkg: 'lint' });
  });

  it('namespaces a ref-keyed hook under nested dirs and rewrites ${PKG_ROOT} to its install dir', async () => {
    const archive = await buildTestArchive({
      type: 'hook',
      slug: 'Superpowers',
      files: [
        {
          path: 'hooks.json',
          body: Buffer.from(
            JSON.stringify({
              PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: '${PKG_ROOT}/scripts/run.sh' }] }],
            }),
          ),
        },
        { path: 'scripts/run.sh', body: Buffer.from('#!/bin/sh\n') },
      ],
    });

    const { written } = await install({ archive, slug: 'superpowers/Superpowers' });

    expect(written).toEqual(
      expect.arrayContaining([expect.stringMatching(/\.claude\/hooks\/superpowers\/Superpowers\/scripts\/run\.sh$/)]),
    );
    expect(await readTestFile('.claude', 'hooks', 'superpowers', 'Superpowers', 'scripts', 'run.sh')).toBe(
      '#!/bin/sh\n',
    );

    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks.PreToolUse[0]).toMatchObject({
      hooks: [{ type: 'command', command: '.claude/hooks/superpowers/Superpowers/scripts/run.sh' }],
      __aipkg: 'superpowers/Superpowers',
    });
  });

  it('throws when an event value is not an array', async () => {
    await expect(
      installFiles({
        type: 'hook',
        slug: 'lint',
        files: [{ path: 'hooks.json', body: Buffer.from(JSON.stringify({ PreToolUse: { matcher: 'Bash' } })) }],
      }),
    ).rejects.toThrow(/event "PreToolUse" must be an array/);
  });
});

describe('remove (hook)', () => {
  it('removes the hook directory and strips its entries from settings.local.json', async () => {
    const archive = await buildTestArchive({
      type: 'hook',
      slug: 'lint',
      files: [
        { path: 'hooks.json', body: Buffer.from(HOOKS_JSON) },
        { path: 'scripts/lint.sh', body: Buffer.from('#!/bin/sh\n') },
      ],
    });
    await install({ archive, slug: 'lint' });

    const { path } = await remove({ type: 'hook', slug: 'lint' });

    expect(path).toMatch(/\.claude\/hooks\/lint$/);
    expect(testFileExists('.claude', 'hooks', 'lint')).toBe(false);

    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks).toBeUndefined();
  });

  it('leaves entries owned by other slugs intact', async () => {
    const lint = await buildTestArchive({
      type: 'hook',
      slug: 'lint',
      files: [{ path: 'hooks.json', body: Buffer.from(HOOKS_JSON) }],
    });
    const fmt = await buildTestArchive({
      type: 'hook',
      slug: 'fmt',
      files: [
        {
          path: 'hooks.json',
          body: Buffer.from(
            JSON.stringify({
              PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'fmt' }] }],
            }),
          ),
        },
      ],
    });
    await install({ archive: lint, slug: 'lint' });
    await install({ archive: fmt, slug: 'fmt' });

    await remove({ type: 'hook', slug: 'lint' });

    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0]).toMatchObject({ matcher: 'Write', __aipkg: 'fmt' });
  });
});

describe('statusLine settings', () => {
  it('setStatusLine writes the block tagged with __aipkg', async () => {
    await settingsConfig.setStatusLine({ slug: 'lint', statusLine: { type: 'command', command: 'status.sh' } });
    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.statusLine).toMatchObject({ type: 'command', command: 'status.sh', __aipkg: 'lint' });
  });

  it('clearStatusLine removes the block', async () => {
    await settingsConfig.setStatusLine({ slug: 'lint', statusLine: { command: 'status.sh' } });
    const { removed } = await settingsConfig.clearStatusLine();
    expect(removed).toBe(true);
    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.statusLine).toBeUndefined();
  });

  it('clearStatusLine reports removed=false when nothing is set', async () => {
    await settingsConfig.write({});
    const { removed } = await settingsConfig.clearStatusLine();
    expect(removed).toBe(false);
  });
});

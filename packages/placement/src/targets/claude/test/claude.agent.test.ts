import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildTestArchive,
  readTestFile,
  readTestJson,
  setupTestCwd,
  teardownTestCwd,
  testFileExists,
  writeTestFile,
} from '../../../test/helpers.ts';
import { ClaudeAgent } from '../claude.agent.ts';

const agent = new ClaudeAgent();

beforeEach(() => setupTestCwd({ prefix: 'aipkg-claude-agent-' }));
afterEach(teardownTestCwd);

describe('ClaudeAgent.install', () => {
  it('writes a rule, keying off the archive entry key, and returns only the written paths', async () => {
    const archive = await buildTestArchive({ type: 'rule', slug: 'no-any' });

    const result = await agent.install({ archive });

    expect(result).toEqual({ paths: [expect.stringMatching(/\.claude\/rules\/no-any\.md$/)], deps: [] });
    expect(await readTestFile('.claude', 'rules', 'no-any.md')).toBe('# no-any\nTest content.');
  });

  it('writes a skill as a directory tree', async () => {
    const archive = await buildTestArchive({
      type: 'skill',
      slug: 'pr-helper',
      files: [
        { path: 'SKILL.md', body: Buffer.from('# pr-helper') },
        { path: 'assets/diagram.txt', body: Buffer.from('drawing') },
      ],
    });

    const { paths: written } = await agent.install({ archive });

    expect(written).toHaveLength(2);
    expect(await readTestFile('.claude', 'skills', 'pr-helper', 'SKILL.md')).toBe('# pr-helper');
    expect(await readTestFile('.claude', 'skills', 'pr-helper', 'assets', 'diagram.txt')).toBe('drawing');
  });

  it('namespaces a setup bundle under its ref and merges its events into settings.local.json', async () => {
    const archive = await buildTestArchive({
      type: 'setup',
      slug: 'lint',
      files: [
        {
          path: 'setup.json',
          body: Buffer.from(
            JSON.stringify({
              PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/lint.sh' }] }],
            }),
          ),
        },
        { path: 'scripts/lint.sh', body: Buffer.from('#!/bin/sh\n') },
      ],
    });

    const { paths: written } = await agent.install({ archive });

    expect(written).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\.claude\/scripts\/acme\/lint\/scripts\/lint\.sh$/),
        expect.stringMatching(/\.claude\/settings\.local\.json$/),
      ]),
    );
    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks.PreToolUse[0]).toMatchObject({ matcher: 'Bash', __aipkg: 'acme/lint' });
  });

  it("applies a setup bundle's status line as a side effect instead of returning it", async () => {
    const archive = await buildTestArchive({
      type: 'setup',
      slug: 'lint',
      files: [
        {
          path: 'setup.json',
          body: Buffer.from(
            JSON.stringify({
              hooks: {},
              statusLine: { type: 'command', command: '${PKG_ROOT}/scripts/status.sh' },
            }),
          ),
        },
        { path: 'scripts/status.sh', body: Buffer.from('#!/bin/sh\n') },
      ],
    });

    const result = await agent.install({ archive });

    // The contract returns only written paths — the status line is applied, not handed back.
    expect(result).not.toHaveProperty('statusLine');
    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.statusLine).toMatchObject({
      type: 'command',
      command: '.claude/scripts/acme/lint/scripts/status.sh',
      __aipkg: 'acme/lint',
    });
  });
});

describe('ClaudeAgent.remove', () => {
  it('removes a rule and returns it under removed[]', async () => {
    await writeTestFile('# no-any', '.claude', 'rules', 'no-any.md');

    const result = await agent.remove({ type: 'rule', refStr: 'no-any' });

    expect(result.paths).toEqual([expect.stringMatching(/\.claude\/rules\/no-any\.md$/)]);
    expect(testFileExists('.claude', 'rules', 'no-any.md')).toBe(false);
  });

  it('removes a setup directory and strips its entries from settings.local.json', async () => {
    const archive = await buildTestArchive({
      type: 'setup',
      slug: 'lint',
      files: [
        {
          path: 'setup.json',
          body: Buffer.from(
            JSON.stringify({
              PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/lint.sh' }] }],
            }),
          ),
        },
      ],
    });
    await agent.install({ archive });

    const { paths: removed } = await agent.remove({ type: 'setup', refStr: 'acme/lint' });

    expect(removed).toEqual([expect.stringMatching(/\.claude\/scripts\/acme\/lint$/)]);
    expect(testFileExists('.claude', 'scripts', 'acme', 'lint')).toBe(false);
    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks).toBeUndefined();
  });

  it("reverses a box's own setup side effects — its bundled children are removed individually by the caller", async () => {
    // Install a box whose setup ships hooks plus a script payload, all owned by
    // the box ref. The bundled children (rule/subagent/skill) are reversed by the
    // caller walking the lockfile subtree, but the setup is the box's alone.
    const archive = await buildTestArchive({
      type: 'box',
      slug: 'app',
      files: [
        {
          path: 'setup.json',
          body: Buffer.from(
            JSON.stringify({
              hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/lint.sh' }] }] },
            }),
          ),
        },
        { path: 'scripts/lint.sh', body: Buffer.from('#!/bin/sh\n') },
        { path: 'rules/style.md', body: Buffer.from('# style') },
      ],
    });
    await agent.install({ archive });

    const { paths: removed } = await agent.remove({ type: 'box', refStr: 'acme/app' });

    // The box's setup payload dir is gone and its hooks are stripped from settings.
    expect(removed).toEqual([expect.stringMatching(/\.claude\/scripts\/acme\/app$/)]);
    expect(testFileExists('.claude', 'scripts', 'acme', 'app')).toBe(false);
    const settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks).toBeUndefined();
  });
});

describe('ClaudeAgent mcp side effects', () => {
  it('adds an MCP server to .mcp.json and removes it again', async () => {
    await agent.addMcp({ slug: 'linear', mcp: { url: 'https://mcp.linear.app/sse' } });

    let config = await readTestJson('.mcp.json');
    expect(config.mcpServers.linear).toEqual({ type: 'http', url: 'https://mcp.linear.app/sse' });

    await agent.removeMcp({ slug: 'linear' });

    config = await readTestJson('.mcp.json');
    expect(config.mcpServers).not.toHaveProperty('linear');
  });
});

describe('ClaudeAgent status line side effects', () => {
  it('addStatusLine writes a tagged block and removeStatusLine clears it', async () => {
    await agent.addStatusLine({ slug: 'lint', statusLine: { type: 'command', command: 'status.sh' } });

    let settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.statusLine).toMatchObject({ type: 'command', command: 'status.sh', __aipkg: 'lint' });

    await agent.removeStatusLine();

    settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.statusLine).toBeUndefined();
  });
});

describe('ClaudeAgent hook config side effects', () => {
  it('addHook merges an event map tagged by slug and removeHook strips it', async () => {
    await agent.addHook({
      slug: 'lint',
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'lint.sh' }] }] },
    });

    let settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks.PreToolUse[0]).toMatchObject({ matcher: 'Bash', __aipkg: 'lint' });

    await agent.removeHook({ slug: 'lint' });

    settings = await readTestJson('.claude', 'settings.local.json');
    expect(settings.hooks).toBeUndefined();
  });
});

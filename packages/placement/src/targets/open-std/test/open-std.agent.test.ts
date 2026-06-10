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
import { OpenStdAgent } from '../open-std.agent.ts';

const agent = new OpenStdAgent();

beforeEach(() => setupTestCwd({ prefix: 'aipkg-open-std-agent-' }));
afterEach(teardownTestCwd);

describe('OpenStdAgent.install', () => {
  it('writes a skill tree under .agents/skills — the open-standard location', async () => {
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
    expect(await readTestFile('.agents/skills/pr-helper/SKILL.md')).toBe('# pr-helper');
    expect(await readTestFile('.agents/skills/pr-helper/assets/diagram.txt')).toBe('drawing');
  });

  it('mirrors the Claude rule layout under .agents/rules/<slug>.md', async () => {
    const archive = await buildTestArchive({ type: 'rule', slug: 'no-any' });

    const result = await agent.install({ archive });

    expect(result).toEqual({ paths: [expect.stringMatching(/\.agents\/rules\/no-any\.md$/)], deps: [] });
    expect(await readTestFile('.agents/rules/no-any.md')).toBe('# no-any\nTest content.');
  });

  it('mirrors the Claude subagent layout as verbatim markdown under .agents/agents', async () => {
    const archive = await buildTestArchive({
      type: 'subagent',
      slug: 'researcher',
      files: [{ path: 'researcher.md', body: Buffer.from('---\ndescription: Finds things\n---\nBody.') }],
    });

    const { paths: written } = await agent.install({ archive });

    expect(written).toEqual([expect.stringMatching(/\.agents\/agents\/researcher\.md$/)]);
    expect(await readTestFile('.agents/agents/researcher.md')).toBe('---\ndescription: Finds things\n---\nBody.');
  });

  it('namespaces a setup bundle under .agents/scripts and merges events into .agents/settings.json', async () => {
    const setupJson = JSON.stringify({
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/lint.sh' }] }],
    });
    const archive = await buildTestArchive({
      type: 'setup',
      slug: 'lint',
      files: [
        { path: 'setup.json', body: Buffer.from(setupJson) },
        { path: 'scripts/lint.sh', body: Buffer.from('#!/bin/sh\n') },
      ],
    });

    const { paths: written } = await agent.install({ archive });

    expect(written).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\.agents\/scripts\/acme\/lint\/scripts\/lint\.sh$/),
        expect.stringMatching(/\.agents\/settings\.json$/),
      ]),
    );
    const settings = await readTestJson('.agents/settings.json');
    expect(settings.hooks.PreToolUse[0]).toMatchObject({ matcher: 'Bash', __aipkg: 'acme/lint' });
  });

  it("applies a setup bundle's status line as a side effect under .agents/settings.json", async () => {
    const setupJson = JSON.stringify({
      hooks: {},
      statusLine: { type: 'command', command: '${PKG_ROOT}/scripts/status.sh' },
    });
    const archive = await buildTestArchive({
      type: 'setup',
      slug: 'lint',
      files: [
        { path: 'setup.json', body: Buffer.from(setupJson) },
        { path: 'scripts/status.sh', body: Buffer.from('#!/bin/sh\n') },
      ],
    });

    const result = await agent.install({ archive });

    expect(result).not.toHaveProperty('statusLine');
    const settings = await readTestJson('.agents/settings.json');
    expect(settings.statusLine).toMatchObject({
      type: 'command',
      command: '.agents/scripts/acme/lint/scripts/status.sh',
      __aipkg: 'acme/lint',
    });
  });

  it('merges a setup bundle MCP server into .agents/mcp.json, tagged by ref', async () => {
    const setupJson = JSON.stringify({ hooks: {}, mcps: { linear: { url: 'https://mcp.linear.app/sse' } } });
    const archive = await buildTestArchive({
      type: 'setup',
      slug: 'linear',
      files: [{ path: 'setup.json', body: Buffer.from(setupJson) }],
    });

    const { paths: written } = await agent.install({ archive });

    expect(written).toEqual(expect.arrayContaining([expect.stringMatching(/\.agents\/mcp\.json$/)]));
    const config = await readTestJson('.agents/mcp.json');
    expect(config.mcpServers['acme/linear/linear']).toMatchObject({
      type: 'http',
      url: 'https://mcp.linear.app/sse',
      __aipkg: 'acme/linear',
    });
  });
});

describe('OpenStdAgent.remove', () => {
  it('removes a rule and returns it under paths[]', async () => {
    await writeTestFile('# no-any', '.agents/rules/no-any.md');

    const result = await agent.remove({ type: 'rule', refStr: 'no-any' });

    expect(result.paths).toEqual([expect.stringMatching(/\.agents\/rules\/no-any\.md$/)]);
    expect(testFileExists('.agents/rules/no-any.md')).toBe(false);
  });

  it('removes a skill tree', async () => {
    await writeTestFile('# pr-helper', '.agents/skills/pr-helper/SKILL.md');

    const result = await agent.remove({ type: 'skill', refStr: 'pr-helper' });

    expect(result.paths).toEqual([expect.stringMatching(/\.agents\/skills\/pr-helper$/)]);
    expect(testFileExists('.agents/skills/pr-helper')).toBe(false);
  });

  it('removes a setup directory and strips its entries from settings.json', async () => {
    const setupJson = JSON.stringify({
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'scripts/lint.sh' }] }],
    });
    const archive = await buildTestArchive({
      type: 'setup',
      slug: 'lint',
      files: [{ path: 'setup.json', body: Buffer.from(setupJson) }],
    });
    await agent.install({ archive });

    const { paths: removed } = await agent.remove({ type: 'setup', refStr: 'acme/lint' });

    expect(removed).toEqual([expect.stringMatching(/\.agents\/scripts\/acme\/lint$/)]);
    expect(testFileExists('.agents/scripts/acme/lint')).toBe(false);
    const settings = await readTestJson('.agents/settings.json');
    expect(settings.hooks).toBeUndefined();
  });
});

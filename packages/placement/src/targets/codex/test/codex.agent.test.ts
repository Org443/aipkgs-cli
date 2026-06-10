import { parse } from 'smol-toml';
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
import { CodexAgent } from '../codex.agent.ts';

const agent = new CodexAgent();

async function readToml(path: string) {
  return parse(await readTestFile(path)) as Record<string, any>;
}

beforeEach(() => setupTestCwd({ prefix: 'aipkg-codex-agent-' }));
afterEach(teardownTestCwd);

describe('CodexAgent.install', () => {
  it('merges a rule into AGENTS.md and returns the written path', async () => {
    const archive = await buildTestArchive({ type: 'rule', slug: 'no-any' });

    const result = await agent.install({ archive });

    expect(result).toEqual({ paths: [expect.stringMatching(/AGENTS\.md$/)], deps: [] });
    expect(await readTestFile('AGENTS.md')).toContain('<!-- aipkg:rule:no-any start -->');
  });

  it('writes a skill tree under .agents/skills', async () => {
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
    expect(await readTestFile('.agents', 'skills', 'pr-helper', 'SKILL.md')).toBe('# pr-helper');
  });

  it('converts a subagent to TOML at .codex/agents/<slug>.toml', async () => {
    const archive = await buildTestArchive({
      type: 'subagent',
      slug: 'researcher',
      files: [{ path: 'researcher.md', body: Buffer.from('---\ndescription: Finds things\n---\nBody.') }],
    });

    const { paths: written } = await agent.install({ archive });

    expect(written).toEqual([expect.stringMatching(/\.codex\/agents\/researcher\.toml$/)]);
    const toml = await readToml('.codex/agents/researcher.toml');
    expect(toml).toMatchObject({ name: 'researcher', description: 'Finds things', developer_instructions: 'Body.' });
  });

  it('namespaces a setup bundle and merges its events into .codex/hooks.json', async () => {
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
        expect.stringMatching(/\.codex\/scripts\/acme\/lint\/scripts\/lint\.sh$/),
        expect.stringMatching(/\.codex\/hooks\.json$/),
      ]),
    );
    const hooks = await readTestJson('.codex', 'hooks.json');
    expect(hooks.hooks.PreToolUse[0]).toMatchObject({ matcher: 'Bash', __aipkg: 'acme/lint' });
  });
});

describe('CodexAgent.remove', () => {
  it('strips a rule block from AGENTS.md', async () => {
    const archive = await buildTestArchive({ type: 'rule', slug: 'no-any' });
    await agent.install({ archive });

    const result = await agent.remove({ type: 'rule', refStr: 'no-any' });

    expect(result.paths).toEqual([expect.stringMatching(/AGENTS\.md$/)]);
    // Sole rule removed → AGENTS.md is deleted rather than left empty.
    expect(testFileExists('AGENTS.md')).toBe(false);
  });

  it('removes a converted subagent toml', async () => {
    await writeTestFile('name = "researcher"\n', '.codex', 'agents', 'researcher.toml');

    const result = await agent.remove({ type: 'subagent', refStr: 'researcher' });

    expect(result.paths).toEqual([expect.stringMatching(/\.codex\/agents\/researcher\.toml$/)]);
    expect(testFileExists('.codex', 'agents', 'researcher.toml')).toBe(false);
  });

  it('removes a skill tree from .agents/skills', async () => {
    await writeTestFile('# x', '.agents', 'skills', 'pr-helper', 'SKILL.md');

    const result = await agent.remove({ type: 'skill', refStr: 'pr-helper' });

    expect(result.paths).toEqual([expect.stringMatching(/\.agents\/skills\/pr-helper$/)]);
    expect(testFileExists('.agents', 'skills', 'pr-helper')).toBe(false);
  });

  it('reverses a setup directory and strips its hooks', async () => {
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

    expect(removed).toEqual([expect.stringMatching(/\.codex\/scripts\/acme\/lint$/)]);
    expect(testFileExists('.codex', 'scripts', 'acme', 'lint')).toBe(false);
    const hooks = await readTestJson('.codex', 'hooks.json');
    expect(hooks.hooks).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { Manifest } from '../../manifest.ts';
import type { TarEntry } from '../../tarball.ts';
import { assertSetupArchive, parseSetup } from '../setup.ts';

function buildManifest() {
  return new Manifest({ type: 'setup', ref: 'acme/lint', version: '0.1.0' });
}

function file(path: string, body = ''): TarEntry {
  return { path, body: Buffer.from(body) };
}

describe('assertSetupArchive', () => {
  it('accepts a bundle with only setup.json and no scripts', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('setup.json', '{}')];
    const setup = assertSetupArchive({ manifest, files });
    expect(setup.events).toEqual({});
    expect(setup.scripts).toEqual([]);
  });

  it('throws when setup.json is missing', () => {
    const manifest = buildManifest();
    const files = [file('aipkg.json'), file('scripts/lint.sh')];
    expect(() => assertSetupArchive({ manifest, files })).toThrow(/missing required file: setup\.json/);
  });
});

describe('parseSetup', () => {
  it('returns the scripts payload, excluding the manifest, setup.json, and sidecars', () => {
    const files = [
      file('aipkg.json'),
      file('setup.json', '{}'),
      file('scripts/lint.sh', '#!/bin/sh\n'),
      file('README.md', 'docs'),
      file('LICENSE.txt', 'mit'),
    ];

    const { scripts } = parseSetup({ files });

    // setup.json, manifest, and the metadata sidecars are excluded from scripts.
    expect(scripts.map((f) => f.path)).toEqual(['scripts/lint.sh']);
  });

  it('decodes a bare event map', () => {
    const body = JSON.stringify({
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'lint.sh' }] }],
    });
    const { events, statusLine, mcps } = parseSetup({ files: [file('setup.json', body)] });

    expect(events.PreToolUse).toHaveLength(1);
    expect(statusLine).toBeUndefined();
    expect(mcps).toBeUndefined();
  });

  it('decodes the wrapper shape with hooks, statusLine, and mcps', () => {
    const body = JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'lint.sh' }] }] },
      statusLine: { type: 'command', command: 'status.sh' },
      mcps: { linear: { url: 'https://mcp.linear.app/sse' } },
    });

    const { events, statusLine, mcps } = parseSetup({ files: [file('setup.json', body)] });

    expect(events.PreToolUse).toHaveLength(1);
    expect(statusLine).toMatchObject({ type: 'command', command: 'status.sh' });
    expect(mcps).toMatchObject({ linear: { url: 'https://mcp.linear.app/sse' } });
  });

  it('rejects statusLine alongside a bare event map', () => {
    const body = JSON.stringify({
      PreToolUse: [{ matcher: 'Bash', hooks: [] }],
      statusLine: { command: 'status.sh' },
    });

    expect(() => parseSetup({ files: [file('setup.json', body)] })).toThrow(/only allowed inside the wrapper shape/);
  });

  it('throws when an event is not an array', () => {
    const body = JSON.stringify({ PreToolUse: { matcher: 'Bash' } });
    expect(() => parseSetup({ files: [file('setup.json', body)] })).toThrow(/must be an array of matcher objects/);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseSetup({ files: [file('setup.json', '{ not json')] })).toThrow(/is not valid JSON/);
  });
});

import { describe, expect, it } from 'vitest';
import { isSetupFeatureTag, withSetupFeatureTags } from '../setup-features.ts';
import type { ArchiveSetup } from '../validate/setup.ts';

function buildSetup(overrides: Partial<ArchiveSetup> = {}): ArchiveSetup {
  return { events: {}, scripts: [], ...overrides };
}

describe('withSetupFeatureTags', () => {
  it('returns no tags for an empty setup with no user tags', () => {
    expect(withSetupFeatureTags({ setup: buildSetup() })).toEqual([]);
  });

  it('detects hooks from a non-empty event map', () => {
    const setup = buildSetup({
      events: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'lint.sh' }] }] },
    });
    expect(withSetupFeatureTags({ setup })).toEqual(['hooks']);
  });

  it('detects mcp from declared servers', () => {
    const setup = buildSetup({ mcps: { linear: { url: 'https://mcp.linear.app' } } });
    expect(withSetupFeatureTags({ setup })).toEqual(['mcp']);
  });

  it('detects statusline from a status line config', () => {
    const setup = buildSetup({ statusLine: { type: 'command', command: 'status.sh' } });
    expect(withSetupFeatureTags({ setup })).toEqual(['statusline']);
  });

  it('treats empty mcps and statusLine objects as absent', () => {
    const setup = buildSetup({ mcps: {}, statusLine: {} });
    expect(withSetupFeatureTags({ setup })).toEqual([]);
  });

  it('reports all three capabilities in a fixed order', () => {
    const setup = buildSetup({
      events: { PreToolUse: [{ hooks: [{ command: 'lint.sh' }] }] },
      mcps: { linear: { url: 'https://mcp.linear.app' } },
      statusLine: { type: 'command', command: 'status.sh' },
    });
    expect(withSetupFeatureTags({ setup })).toEqual(['hooks', 'mcp', 'statusline']);
  });

  it('preserves user tags ahead of the capability tags', () => {
    const setup = buildSetup({ mcps: { linear: { url: 'https://mcp.linear.app' } } });
    expect(withSetupFeatureTags({ tags: ['productivity', 'linear'], setup })).toEqual([
      'productivity',
      'linear',
      'mcp',
    ]);
  });

  it('de-duplicates a user tag that collides with a capability tag', () => {
    const setup = buildSetup({ statusLine: { type: 'command', command: 'status.sh' } });
    expect(withSetupFeatureTags({ tags: ['statusline', 'theme'], setup })).toEqual(['statusline', 'theme']);
  });
});

describe('isSetupFeatureTag', () => {
  it('recognizes the reserved capability tags', () => {
    expect(isSetupFeatureTag('hooks')).toBe(true);
    expect(isSetupFeatureTag('mcp')).toBe(true);
    expect(isSetupFeatureTag('statusline')).toBe(true);
  });

  it('rejects free-text tags and inherited object keys', () => {
    expect(isSetupFeatureTag('productivity')).toBe(false);
    expect(isSetupFeatureTag('toString')).toBe(false);
  });
});

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigFile } from '../config.ts';

let home = '';
let originalHome: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'aipkg-config-test-'));
  originalHome = process.env.HOME;
  process.env.HOME = home;
  // biome-ignore lint/performance/noDelete: assigning undefined to process.env stores the string "undefined"
  delete process.env.AIPKG_TARGET;
});

afterEach(() => {
  process.env.HOME = originalHome;
  // biome-ignore lint/performance/noDelete: assigning undefined to process.env stores the string "undefined"
  delete process.env.AIPKG_TARGET;
  rmSync(home, { recursive: true, force: true });
});

describe('ConfigFile.exists', () => {
  it('is false before anything is written and true after', async () => {
    expect(await ConfigFile.exists()).toBe(false);
    await ConfigFile.setTargets(['claude']);
    expect(await ConfigFile.exists()).toBe(true);
  });
});

describe('ConfigFile.setTargets / resolvedTargets', () => {
  it('persists multiple targets and reads them back', async () => {
    await ConfigFile.setTargets(['claude', 'codex']);

    const raw = await readFile(ConfigFile.path(), 'utf8');
    expect(JSON.parse(raw)).toMatchObject({ targets: ['claude', 'codex'] });
    expect(await ConfigFile.resolvedTargets()).toEqual(['claude', 'codex']);
  });

  it('clears targets when given an empty array', async () => {
    await ConfigFile.setTargets(['claude']);
    await ConfigFile.setTargets([]);

    const config = await ConfigFile.resolve();
    expect(config.targets).toBeUndefined();
  });

  it('throws a helpful error when no target is configured', async () => {
    await expect(ConfigFile.resolvedTargets()).rejects.toThrow(/No target configured/);
  });
});

describe('AIPKG_TARGET env override', () => {
  it('parses a single target', async () => {
    process.env.AIPKG_TARGET = 'codex';
    expect(await ConfigFile.resolvedTargets()).toEqual(['codex']);
  });

  it('parses a comma-separated list and trims whitespace', async () => {
    process.env.AIPKG_TARGET = 'claude, codex';
    expect(await ConfigFile.resolvedTargets()).toEqual(['claude', 'codex']);
  });

  it('wins over a configured value', async () => {
    await ConfigFile.setTargets(['claude']);
    process.env.AIPKG_TARGET = 'codex';
    expect(await ConfigFile.resolvedTargets()).toEqual(['codex']);
  });

  it('rejects an invalid target', async () => {
    process.env.AIPKG_TARGET = 'bogus';
    await expect(ConfigFile.resolvedTargets()).rejects.toThrow(/Invalid AIPKG_TARGET/);
  });
});

describe('ConfigFile.setAipkgsMirror / aipkgsMirror', () => {
  it('defaults to disabled', async () => {
    expect(await ConfigFile.aipkgsMirror()).toBe('disabled');
  });

  it('persists the enabled state and reads it back', async () => {
    await ConfigFile.setAipkgsMirror('enabled');

    const raw = await readFile(ConfigFile.path(), 'utf8');
    expect(JSON.parse(raw)).toMatchObject({ mirror: 'enabled' });
    expect(await ConfigFile.aipkgsMirror()).toBe('enabled');
  });

  it('drops the field when disabled so config stays minimal', async () => {
    await ConfigFile.setAipkgsMirror('enabled');
    await ConfigFile.setAipkgsMirror('disabled');

    const config = await ConfigFile.resolve();
    expect(config.mirror).toBeUndefined();
    expect(await ConfigFile.aipkgsMirror()).toBe('disabled');
  });
});

describe('legacy target migration', () => {
  async function writeLegacyConfig(config: Record<string, unknown>) {
    const path = ConfigFile.path();
    mkdirSync(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(config));
  }

  it('folds a singular target into targets and drops the old field', async () => {
    await writeLegacyConfig({ api: 'https://example.test', target: 'claude' });

    expect(await ConfigFile.resolvedTargets()).toEqual(['claude']);

    const raw = await readFile(ConfigFile.path(), 'utf8');
    const onDisk = JSON.parse(raw);
    expect(onDisk).toMatchObject({ targets: ['claude'] });
    expect(onDisk.target).toBeUndefined();
  });

  it('is idempotent — a second resolve leaves the file untouched', async () => {
    await writeLegacyConfig({ api: 'https://example.test', target: 'codex' });

    await ConfigFile.resolve();
    const first = await readFile(ConfigFile.path(), 'utf8');
    await ConfigFile.resolve();
    const second = await readFile(ConfigFile.path(), 'utf8');

    expect(second).toBe(first);
  });

  it('keeps existing targets when both fields are present', async () => {
    await writeLegacyConfig({ api: 'https://example.test', target: 'claude', targets: ['codex'] });

    expect(await ConfigFile.resolvedTargets()).toEqual(['codex']);
  });
});

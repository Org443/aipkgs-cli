import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';
import { EMPTY_LOCKFILE, EMPTY_MANIFEST, setupTestCwd, teardownTestCwd, writeTestFile } from '../../test/helpers.ts';

// Shared world setup for the per-type install/remove e2e suites. Each suite calls
// this once at module scope; it registers the beforeEach/afterEach that every
// suite would otherwise copy verbatim. Type-specific archive building and fetch
// routing stay in the individual suites so they never couple to each other —
// this only owns the transport/world plumbing (isolated cwd + HOME, env, console
// silencing, and an empty manifest/lockfile to install into).
export function useE2EWorld(args: { prefix: string }) {
  const { prefix } = args;
  let home = '';
  let originalHome: string | undefined;

  beforeEach(async () => {
    setupTestCwd({ prefix });
    // Isolate HOME so the suite reads a fresh config (mirror off) instead of the
    // dev's real ~/.aipkg/config.json.
    home = mkdtempSync(join(tmpdir(), `${prefix}home-`));
    originalHome = process.env.HOME;
    process.env.HOME = home;
    process.env.AIPKG_API = 'http://test.invalid';
    process.env.AIPKG_TARGET = 'claude';
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await writeTestFile(EMPTY_MANIFEST, 'aipkg.json');
    await writeTestFile(EMPTY_LOCKFILE, 'aipkg.lock');
  });

  afterEach(() => {
    teardownTestCwd();
    vi.restoreAllMocks();
    process.env.HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
    // biome-ignore lint/performance/noDelete: assigning undefined to process.env stores the string "undefined"
    delete process.env.AIPKG_API;
    // biome-ignore lint/performance/noDelete: assigning undefined to process.env stores the string "undefined"
    delete process.env.AIPKG_TARGET;
  });
}

// Route every `fetch` to a single archive tarball — the shape a standalone
// package (rule, setup, box) with no separately-fetched deps needs. Returns the
// spy for URL/call-count assertions.
export function mockArchiveFetch(tarball: Buffer) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(tarball, { status: 200, headers: { 'Content-Type': 'application/gzip' } }));
}

// Route `fetch` by URL substring to one of several tarballs — the shape a package
// that pulls in separately-fetched deps (a skill or subagent with a rule dep)
// needs. An unmatched URL throws so a misrouted download fails loudly. Returns
// the spy for call-count assertions.
export function mockArchiveRoutes(routes: Array<{ match: string; tarball: Buffer }>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input);
    const route = routes.find((r) => url.includes(r.match));
    if (route) {
      return new Response(route.tarball, { status: 200, headers: { 'Content-Type': 'application/gzip' } });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

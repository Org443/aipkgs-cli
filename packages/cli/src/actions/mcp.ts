import type { McpEntry } from '@local/archive';
import { place } from '@local/placement';
import pc from 'picocolors';
import { SEGMENT } from '../constants.ts';
import { ConfigFile } from '../files/config.ts';
import { Lockfile } from '../files/lockfile.ts';
import { ManifestFile } from '../files/manifest.ts';

export async function mcpAddAction(input: {
  slug: string;
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  env?: Record<string, string>;
}) {
  const { slug, url, command, args, headers, env } = input;

  if (!SEGMENT.test(slug)) {
    throw new Error(`Invalid mcp slug "${slug}" — use letters, digits, hyphens, and underscores only`);
  }

  if (!url && !command) {
    throw new Error('Must provide either --url or --command');
  }
  if (url && command) {
    throw new Error('Provide only one of --url or --command, not both');
  }

  const entry: McpEntry = {};
  if (url) entry.url = url;
  if (headers && Object.keys(headers).length > 0) entry.headers = headers;
  if (command) entry.command = command;
  if (args && args.length > 0) entry.args = args;
  if (env && Object.keys(env).length > 0) entry.env = env;

  const manifest = await ManifestFile.resolve();
  const lockfile = await Lockfile.resolve();

  manifest.upsertMcp({ slug, entry });
  lockfile.upsertMcp({ slug, entry });

  const targets = await ConfigFile.resolvedTargets();
  const { written } = await place.installMcp({ slug, entry, targets });

  await manifest.write();
  await lockfile.write();

  console.log(`${pc.green('Installed')} ${pc.bold(`mcp ${slug}`)}`);
  for (const path of written) console.log(pc.dim(`  ${path}`));
}

export async function mcpRemoveAction(input: { slug: string }) {
  const { slug } = input;

  if (!SEGMENT.test(slug)) {
    throw new Error(`Invalid mcp slug "${slug}"`);
  }

  const manifest = await ManifestFile.resolve();
  const lockfile = await Lockfile.resolve();

  const { removed: removedFromManifest } = manifest.removeMcp({ slug });
  const removedFromLock = lockfile.removeMcp({ slug });

  const targets = await ConfigFile.resolvedTargets();
  const { removed: removedFromConfig, paths: removedPaths } = await place.removeMcp({ slug, targets });

  if (!removedFromManifest && !removedFromLock && !removedFromConfig) {
    console.log(pc.yellow(`Nothing to remove — no mcp "${slug}" tracked`));
    return;
  }

  await manifest.write();
  await lockfile.write();

  console.log(`${pc.green('Removed')} ${pc.bold(`mcp ${slug}`)}`);
  for (const path of removedPaths) console.log(pc.dim(`  ${path}`));
  if (removedFromManifest) console.log(pc.dim('  aipkg.json'));
  if (removedFromLock) console.log(pc.dim('  aipkg.lock'));
}

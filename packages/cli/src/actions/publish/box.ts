import { readFile, readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { DEPS_KEYS, type DepsKey, type TarEntry, archiveService } from '@local/archive';
import pc from 'picocolors';
import { api } from '../../api/index.ts';
import { ConfigFile } from '../../files/config.ts';
import { ManifestFile } from '../../files/manifest.ts';
import { collectBoxSidecars } from '../../io/archive.ts';

export async function publishBoxManifestAction(input: { dir?: string; file?: string } = {}) {
  const boxDir = resolveLocalPath(input.dir ?? process.cwd());
  const manifest = await ManifestFile.read({ dir: boxDir, file: input.file });

  const localDeps = await collectLocalDeps({ cwd: boxDir });
  const sidecars = await collectBoxSidecars({ dir: boxDir });

  const files: TarEntry[] = [...sidecars];
  for (const [key, entries] of localDeps.entries()) {
    console.log(pc.green(`packing ${entries.length} local deps for ${key}`));

    const logEntries = entries.slice(0, 10); // Log only the first 10 entries for brevity.
    console.log(pc.dim(logEntries.map((e) => `  ${e.path}`).join('\n')));
    if (entries.length > 10) {
      console.log(pc.dim(`... and ${entries.length - 10} more`));
    }

    files.push(...entries);
  }

  const { tgz } = await archiveService.pack({ manifest, files });
  await api.packages.uploadArchive({ tarball: tgz });

  const { type, pkgRef } = manifest;
  const { slug, version } = pkgRef;
  const appUrl = `${ConfigFile.appBase()}${pkgRef.appPath()}`;

  console.log(pc.green('Published'), pc.bold(`${type} ${slug}`), pc.dim(version));
  console.log(pc.green('App URL:'), pc.bold(appUrl));
}

async function collectLocalDeps(args: { cwd: string }): Promise<Map<DepsKey, TarEntry[]>> {
  const { cwd } = args;

  const out = new Map<DepsKey, TarEntry[]>();

  for (const key of DEPS_KEYS) {
    // Find all the dirs in the cwd that match the key.
    if (key === 'boxes') continue;

    const keyDir = join(cwd, key);
    const keyStat = await stat(keyDir).catch(() => null);
    if (!keyStat?.isDirectory()) continue;

    const entries: TarEntry[] = [];
    const items = await readdir(keyDir, { withFileTypes: true });

    if (key === 'skills') {
      for (const item of items) {
        if (!item.isDirectory()) continue;
        const slug = item.name;
        const dir = join(keyDir, slug);
        await walkSkillDir({ root: dir, prefix: `${key}/${slug}`, out: entries });
      }
    } else {
      for (const item of items) {
        if (!item.isFile() || !item.name.endsWith('.md')) continue;
        const rel = `${key}/${item.name}`;
        const body = await readFile(join(keyDir, item.name));
        entries.push({ path: rel, body });
      }
    }

    if (entries.length) out.set(key, entries);
  }

  return out;
}

async function walkSkillDir(args: { root: string; prefix: string; out: TarEntry[] }) {
  const { root, prefix, out } = args;
  const stack: Array<{ dir: string; rel: string }> = [{ dir: root, rel: '' }];
  while (stack.length) {
    const frame = stack.pop();
    if (!frame) break;
    const { dir, rel } = frame;
    const items = await readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const full = join(dir, item.name);
      const childRel = rel ? `${rel}/${item.name}` : item.name;
      if (item.isDirectory()) {
        stack.push({ dir: full, rel: childRel });
        continue;
      }
      if (!item.isFile()) continue;
      out.push({ path: `${prefix}/${childRel}`, body: await readFile(full) });
    }
  }
}

function resolveLocalPath(path: string): string {
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type AIpkgArchive, MANIFEST_FILENAME, type Manifest, type TarEntry } from '@local/archive';

export async function install(args: { archive: AIpkgArchive; slug: string }) {
  const { archive, slug } = args;
  const { type } = archive.manifest;
  const files = archive.files.filter((f) => f.path !== MANIFEST_FILENAME);
  return installFiles({ type, slug, files });
}

export async function installFiles(args: { type: Manifest['type']; slug: string; files: TarEntry[] }) {
  const { type, slug, files } = args;
  const path = pathFor({ type, slug });

  const written: string[] = [];

  if (type === 'skill') {
    for (const entry of files) {
      const dest = join(path, entry.path);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, entry.body);
      written.push(dest);
    }
    return { written };
  }

  await mkdir(dirname(path), { recursive: true });

  const file = files[0];
  if (!file) throw new Error(`No files to place for ${type}/${slug}`);

  await writeFile(path, file.body);
  written.push(path);

  return { written };
}

export async function remove(args: { type: Manifest['type']; slug: string }): Promise<{ path: string }> {
  const path = pathFor(args);
  await rm(path, { recursive: true, force: true });
  return { path };
}

function pathFor(args: { type: Manifest['type']; slug: string }): string {
  const { type, slug } = args;
  const cwd = process.cwd();
  switch (type) {
    case 'cmd':
      return join(cwd, '.claude', 'commands', `${slug}.md`);
    case 'subagent':
      return join(cwd, '.claude', 'agents', `${slug}.md`);
    case 'rule':
      return join(cwd, '.claude', 'rules', `${slug}.md`);
    case 'skill':
      return join(cwd, '.claude', 'skills', slug);
    case 'box':
      throw new Error('Cannot place a box package — boxes are imported via `aipkg box`, not installed');
    default:
      throw new Error(`We don't support placing ${type satisfies never}s yet`);
  }
}
